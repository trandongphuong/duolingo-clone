/** Real-HTTP regression. Run only against the isolated local release test app. */
import { existsSync } from "node:fs";
import { lstat, readFile, readdir, realpath } from "node:fs/promises";
import { request as requestHttp } from "node:http";
import { request as requestHttps } from "node:https";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

import { chromium, type Browser } from "@playwright/test";
import { Pool, type PoolClient } from "pg";

type Actor = { id: string; username: string; role: string; active: boolean };
type Reply = { status: number; body: string };
type PendingUpload = {
  result: Promise<Reply>;
  cancel: () => void;
};

class RegressionError extends Error {}

let stage = "configuration guards";

function check(value: unknown, message: string): asserts value {
  if (!value) throw new RegressionError(message);
}

function below(parent: string, child: string) {
  return child.startsWith(parent + path.sep);
}

async function safeWorkPath(
  candidate: string,
  root: string,
  mayBeMissing = false
) {
  const absolute = path.resolve(candidate);
  check(below(root, absolute), "Test fixture paths must remain inside work/.");
  try {
    const stats = await lstat(absolute);
    check(!stats.isSymbolicLink(), "Test fixture paths must not be symlinks.");
    check(
      below(root, await realpath(absolute)),
      "Test fixture paths must resolve inside work/."
    );
  } catch (error) {
    if (!(mayBeMissing && (error as NodeJS.ErrnoException).code === "ENOENT"))
      throw error;
    const parent = await realpath(path.dirname(absolute));
    check(
      parent === root || below(root, parent),
      "Test media parent must resolve inside work/."
    );
  }
  return absolute;
}

async function filenames(directory: string) {
  try {
    return (await readdir(directory)).sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

function uploadWav(origin: URL, cookie: string, wav: Buffer): PendingUpload {
  const boundary = "hnb-media-revocation-fixture";
  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="test-tone.wav"\r\nContent-Type: audio/wav\r\n\r\n`
    ),
    wav,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  const send = origin.protocol === "https:" ? requestHttps : requestHttp;
  let cancel = () => {};
  const result = new Promise<Reply>((resolve, reject) => {
    const request = send(
      new URL("/api/media", origin),
      {
        method: "POST",
        headers: {
          Origin: origin.origin,
          Cookie: cookie,
          "Content-Type": `multipart/form-data; boundary=${boundary}`,
          "Content-Length": body.length,
        },
      },
      (response) => {
        const chunks: Buffer[] = [];
        let bytes = 0;
        response.on("data", (chunk: Buffer) => {
          bytes += chunk.length;
          if (bytes > 16 * 1024) {
            request.destroy();
            reject(
              new RegressionError("Upload response exceeded the test bound.")
            );
          } else chunks.push(chunk);
        });
        response.once("error", () =>
          reject(new RegressionError("Upload response stream failed."))
        );
        response.once("end", () =>
          resolve({
            status: response.statusCode ?? 0,
            body: Buffer.concat(chunks).toString("utf8"),
          })
        );
      }
    );
    cancel = () => request.destroy();
    request.once("error", () =>
      reject(
        new RegressionError("Upload request failed before a complete reply.")
      )
    );
    request.setTimeout(15_000, () => request.destroy());
    request.end(body);
  });
  return { result, cancel: () => cancel() };
}

async function waitForActorLock(
  pool: Pool,
  blockerPid: number,
  completed: () => boolean
) {
  const deadline = Date.now() + 5_000;
  do {
    const rows = await pool.query(
      `SELECT a.pid FROM pg_stat_activity a
       WHERE a.datname = current_database()
         AND a.wait_event_type = 'Lock'
         AND a.query ILIKE '%users%'
         AND a.query ILIKE '%for share%'
         AND $1::integer = ANY(pg_blocking_pids(a.pid))`,
      [blockerPid]
    );
    if (rows.rowCount) return;
    check(
      !completed(),
      "Upload completed before the actor-lock barrier; use the current test build."
    );
    await delay(25);
  } while (Date.now() < deadline);
  throw new RegressionError("Did not observe the upload actor-lock barrier.");
}

async function main() {
  const databaseUrl = process.env.TEST_DATABASE_URL;
  check(
    databaseUrl && databaseUrl === process.env.DATABASE_URL,
    "DATABASE_URL and TEST_DATABASE_URL must identify the same disposable DB."
  );
  const database = new URL(databaseUrl);
  check(
    ["postgres:", "postgresql:"].includes(database.protocol) &&
      ["localhost", "127.0.0.1", "[::1]"].includes(database.hostname) &&
      /test|e2e/i.test(decodeURIComponent(database.pathname)),
    "Use only a loopback PostgreSQL database named test or e2e."
  );
  const origin = new URL(process.env.BASE_URL ?? "http://127.0.0.1:3300");
  check(
    ["http:", "https:"].includes(origin.protocol) &&
      ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname) &&
      !origin.username &&
      !origin.password &&
      !origin.search &&
      !origin.hash &&
      ["", "/"].includes(origin.pathname),
    "Use only the local test application's loopback origin."
  );
  const work = await realpath(path.resolve("work"));
  const fixtureFile = await safeWorkPath(
    process.env.TEST_ACCOUNTS_FILE ?? "work/test-accounts.json",
    work
  );
  check(
    process.env.MEDIA_DIR,
    "MEDIA_DIR must name the local test media directory."
  );
  const mediaDirectory = await safeWorkPath(process.env.MEDIA_DIR, work, true);
  const fixture = JSON.parse(await readFile(fixtureFile, "utf8")) as {
    author?: string;
    password?: string;
  };
  check(
    fixture.author === "demo_author" &&
      typeof fixture.password === "string" &&
      fixture.password.length >= 12,
    "Use only the synthetic demo_author fixture with a configured password."
  );
  const wav = await readFile("data/test-tone.wav");
  const pool = new Pool({
    connectionString: databaseUrl,
    max: 3,
    connectionTimeoutMillis: 5000,
  });
  pool.on("error", () => {});
  let browser: Browser | undefined;
  let blocker: PoolClient | undefined;
  let original: Actor | undefined;
  let transactionOpen = false;
  let pending: PendingUpload | undefined;
  let restorationNeeded = false;
  try {
    stage = "synthetic actor verification";
    const actors = await pool.query<Actor>(
      "SELECT id, username, role, active FROM users WHERE username = $1",
      [fixture.author]
    );
    original = actors.rows[0];
    check(
      original?.username === "demo_author" &&
        original.role === "author" &&
        original.active,
      "The synthetic author must be active before this regression."
    );
    const actor = original;
    const mediaRows = () =>
      pool.query(
        "SELECT id, path, mime, size FROM media_files WHERE created_by = $1 ORDER BY id",
        [actor.id]
      );

    stage = "browser login";
    browser = await chromium.launch({
      headless: true,
      executablePath:
        process.env.CHROMIUM_EXECUTABLE_PATH ||
        (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined),
    });
    const context = await browser.newContext();
    await context.route("**/*", (route) => {
      const target = new URL(route.request().url());
      return target.origin === origin.origin ? route.continue() : route.abort();
    });
    const page = await context.newPage();
    await page.goto(new URL("/sign-in", origin).href);
    await page
      .getByLabel("Tên đăng nhập", { exact: true })
      .fill(fixture.author);
    await page.getByLabel("Mật khẩu", { exact: true }).fill(fixture.password);
    await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
    await page.waitForURL(/\/(?:learn|courses)(?:\?|$)/);
    const cookie = (await context.cookies(origin.origin))
      .map((entry) => `${entry.name}=${entry.value}`)
      .join("; ");
    check(
      cookie.length > 0,
      "Synthetic browser login did not provide a session."
    );

    blocker = await pool.connect();
    const pid = (
      await blocker.query<{ pid: number }>("SELECT pg_backend_pid() AS pid")
    ).rows[0].pid;
    for (const mode of ["demote", "lock"] as const) {
      stage = `${mode} upload actor-lock barrier`;
      const beforeRows = (await mediaRows()).rows;
      const beforeFiles = await filenames(mediaDirectory);
      await blocker.query("BEGIN");
      transactionOpen = true;
      await blocker.query(
        mode === "demote"
          ? "UPDATE users SET role = 'learner' WHERE id = $1"
          : "UPDATE users SET active = false WHERE id = $1",
        [actor.id]
      );
      pending = uploadWav(origin, cookie, wav);
      let completed = false;
      let uploadError: unknown;
      const reply = pending.result.then(
        (value) => {
          completed = true;
          return value;
        },
        (error) => {
          completed = true;
          uploadError = error;
          return undefined;
        }
      );
      await waitForActorLock(pool, pid, () => completed);
      console.log(
        `PASS ${mode}: real upload waited on the actor-row authorization lock.`
      );

      restorationNeeded = true;
      await blocker.query("COMMIT");
      transactionOpen = false;
      stage = `${mode} denial and file cleanup`;
      const response = await reply;
      if (uploadError) throw uploadError;
      check(response?.status === 403, "Revoked upload did not return HTTP403.");
      const body = JSON.parse(response.body) as { error?: string };
      check(
        typeof body.error === "string" && /khóa|quyền/.test(body.error),
        "Revoked upload did not return the authorization error."
      );
      check(
        JSON.stringify((await mediaRows()).rows) === JSON.stringify(beforeRows),
        "Revoked upload changed media metadata."
      );
      check(
        JSON.stringify(await filenames(mediaDirectory)) ===
          JSON.stringify(beforeFiles),
        "Revoked upload left or changed a media file."
      );
      pending = undefined;
      await blocker.query(
        "UPDATE users SET role = $2, active = $3 WHERE id = $1",
        [actor.id, actor.role, actor.active]
      );
      restorationNeeded = false;
      console.log(
        `PASS ${mode}: HTTP403, unchanged media rows/files, synthetic actor restored.`
      );
    }
    stage = "complete";
    console.log(
      "PASS real-HTTP media revocation regression: 2 races; no media writes survived."
    );
  } finally {
    // A full request may already be waiting in the server. Keep it revoked
    // until its response instead of rolling back and allowing a late write.
    if (pending && transactionOpen && blocker) {
      restorationNeeded = true;
      await blocker.query("COMMIT");
      transactionOpen = false;
      await pending.result.catch(() => undefined);
    }
    pending?.cancel();
    if (transactionOpen && blocker)
      await blocker.query("ROLLBACK").catch(() => undefined);
    if (restorationNeeded && original && blocker) {
      await blocker.query(
        "UPDATE users SET role = $2, active = $3 WHERE id = $1",
        [original.id, original.role, original.active]
      );
    }
    blocker?.release();
    await browser?.close();
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(
    error instanceof RegressionError
      ? error.message
      : `Media revocation regression failed during ${stage}; inspect the private test environment.`
  );
  process.exitCode = 1;
});
