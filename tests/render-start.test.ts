import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";

import { createRenderEnvironment } from "../scripts/render-start.mjs";

const environment = () => ({
  ...process.env,
  RENDER: "true",
  DEMO_MODE: "true",
  DEMO_DATA_POLICY: "SYNTHETIC_ONLY",
  APP_ORIGIN: undefined,
  RENDER_EXTERNAL_URL: "https://hnb-demo.example.test",
  SESSION_SECURE: "true",
  PORT: "10000",
  DEMO_ADMIN_PASSWORD: randomBytes(24).toString("hex"),
});

function fixture(t: TestContext, bootstrap: string, server: string) {
  const directory = mkdtempSync(path.join(os.tmpdir(), "hnb-render-test-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  mkdirSync(path.join(directory, "maintenance"));
  copyFileSync("scripts/render-start.mjs", path.join(directory, "render-start.mjs"));
  writeFileSync(path.join(directory, "maintenance/demo-bootstrap.cjs"), bootstrap);
  writeFileSync(path.join(directory, "server.js"), server);
  return directory;
}

test("Render maps its HTTPS URL, retains a custom origin, and binds the web process to all interfaces", () => {
  const input = environment();
  const mapped = createRenderEnvironment(input);
  assert.equal(mapped.APP_ORIGIN, input.RENDER_EXTERNAL_URL);
  assert.equal(mapped.HOSTNAME, "0.0.0.0");
  assert.equal(mapped.PORT, "10000");
  assert.equal(mapped.NODE_ENV, "production");
  assert.equal(mapped.NEXT_TELEMETRY_DISABLED, "1");
  assert.equal(mapped.DEMO_MEDIA_STORAGE, "ephemeral");
  assert.equal(input.APP_ORIGIN, undefined);
  assert.equal(createRenderEnvironment({ ...input, APP_ORIGIN: "https://demo.example.test" }).APP_ORIGIN, "https://demo.example.test");
});

test("Render refuses accidental LAN use, insecure origins/cookies and invalid listener ports", () => {
  for (const overrides of [
    { RENDER: undefined }, { DEMO_MODE: "false" }, { DEMO_DATA_POLICY: "REAL_DATA" },
    { APP_ORIGIN: "http://example.test" }, { APP_ORIGIN: "https://example.test/path" },
    { APP_ORIGIN: "https://user:private-secret@example.test" }, { APP_ORIGIN: "" },
    { RENDER_EXTERNAL_URL: undefined }, { SESSION_SECURE: "false" },
    { PORT: "0" }, { PORT: "65536" }, { PORT: "1.5" }, { PORT: "10000;echo test" },
  ]) {
    assert.throws(() => createRenderEnvironment({ ...environment(), ...overrides }), (error: unknown) =>
      error instanceof Error && !error.message.includes("private-secret"));
  }
});

test("Render starts web only after bootstrap and excludes the initial admin secret from web environment", (t) => {
  const directory = fixture(t,
    `require('node:fs').writeFileSync('order', 'B');`,
    `const fs = require('node:fs');
     if (fs.readFileSync('order', 'utf8') !== 'B') process.exit(9);
     fs.appendFileSync('order', 'S');
     console.log(JSON.stringify({origin:process.env.APP_ORIGIN, secure:process.env.SESSION_SECURE,
       hostname:process.env.HOSTNAME, leaked:Object.hasOwn(process.env,'DEMO_ADMIN_PASSWORD')}));`);
  const env = environment();
  const result = spawnSync(process.execPath, ["render-start.mjs"], { cwd: directory, env, encoding: "utf8", timeout: 5000 });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(readFileSync(path.join(directory, "order"), "utf8"), "BS");
  assert.deepEqual(JSON.parse(result.stdout.trim()), {
    origin: env.RENDER_EXTERNAL_URL, secure: "true", hostname: "0.0.0.0", leaked: false,
  });
  assert.equal((result.stdout + result.stderr).includes(env.DEMO_ADMIN_PASSWORD), false);
});

test("failed bootstrap preserves its exit code and never launches web", (t) => {
  const directory = fixture(t, "process.exit(7)", "require('node:fs').writeFileSync('web-started', 'yes')");
  const result = spawnSync(process.execPath, ["render-start.mjs"], { cwd: directory, env: environment(), encoding: "utf8", timeout: 5000 });
  assert.equal(result.status, 7);
  assert.equal(existsSync(path.join(directory, "web-started")), false);
  assert.match(result.stderr, /Bootstrap demo thất bại/);
});

for (const stage of ["bootstrap", "web"] as const) {
  test(`SIGTERM reaches ${stage} and shuts down without launching another process`, async (t) => {
    const waiting = `process.once('SIGTERM', () => {require('node:fs').writeFileSync('terminated','SIGTERM'); process.exit(0)});
      console.log('READY'); setInterval(() => {}, 1000);`;
    const directory = fixture(t, stage === "bootstrap" ? waiting : "",
      stage === "web" ? waiting : "require('node:fs').writeFileSync('web-started', 'yes')");
    const child = spawn(process.execPath, ["render-start.mjs"], { cwd: directory, env: environment(), stdio: ["ignore", "pipe", "pipe"] });
    t.after(() => { if (child.exitCode === null) child.kill("SIGKILL"); });
    const code = await new Promise<number | null>((resolve, reject) => {
      const timer = setTimeout(() => { child.kill("SIGKILL"); reject(new Error("Render shutdown timed out")); }, 5000);
      let output = "";
      let sent = false;
      child.stdout.on("data", (chunk) => {
        output += String(chunk);
        if (!sent && output.includes("READY")) { sent = true; child.kill("SIGTERM"); }
      });
      child.once("error", (error) => { clearTimeout(timer); reject(error); });
      child.once("exit", (value) => { clearTimeout(timer); resolve(value); });
    });
    assert.equal(code, 143);
    assert.equal(readFileSync(path.join(directory, "terminated"), "utf8"), "SIGTERM");
    assert.equal(existsSync(path.join(directory, "web-started")), false);
  });
}
