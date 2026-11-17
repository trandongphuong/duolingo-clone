/** Strict-TLS API regression for the isolated local release Compose fixture. */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, readFile, realpath } from "node:fs/promises";
import path from "node:path";

import {
  request,
  type APIRequestContext,
  type APIResponse,
} from "@playwright/test";

import { SESSION_COOKIE } from "../../lib/session-token";

type HtmlForm = { names: string[]; hidden: [string, string][]; text: string };
class TlsRegressionError extends Error {}
let stage = "configuration guards";

function check(value: unknown, message: string): asserts value {
  if (!value) throw new TlsRegressionError(message);
}

async function workFile(candidate: string) {
  const work = await realpath("work");
  const absolute = path.resolve(candidate);
  check(
    absolute.startsWith(work + path.sep),
    "QA files must remain under work/."
  );
  const stat = await lstat(absolute);
  check(
    stat.isFile() && !stat.isSymbolicLink(),
    "QA files must be regular files."
  );
  check(
    (await realpath(absolute)).startsWith(work + path.sep),
    "QA paths must resolve under work/."
  );
  return absolute;
}

// HTMLParser handles character references and script raw text without executing
// app JavaScript. Only public SSR form metadata travels to this parser.
const parseFormsPython = String.raw`
import json, sys
from html.parser import HTMLParser
class Forms(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.forms=[]; self.current=None; self.raw=0
    def handle_starttag(self, tag, attributes):
        attrs=dict(attributes)
        if tag=='form':
            if self.current is not None: raise ValueError('Nested form')
            self.current={'names':[],'hidden':[],'text':[]}
        if tag in ('script','style'): self.raw+=1
        if self.current is not None and tag=='input':
            name=attrs.get('name')
            if name:
                self.current['names'].append(name)
                if attrs.get('type','').lower()=='hidden':
                    self.current['hidden'].append([name,attrs.get('value') or ''])
    def handle_endtag(self, tag):
        if tag in ('script','style') and self.raw: self.raw-=1
        if tag=='form' and self.current is not None:
            self.current['text']=' '.join(self.current['text']).strip()
            self.forms.append(self.current); self.current=None
    def handle_data(self, data):
        if self.current is not None and not self.raw:
            self.current['text'].append(data)
parser=Forms(); parser.feed(sys.stdin.read()); parser.close()
print(json.dumps(parser.forms))
`;

function forms(html: string): HtmlForm[] {
  const output = execFileSync("python3", ["-c", parseFormsPython], {
    input: html,
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
    stdio: ["pipe", "pipe", "pipe"],
  });
  const parsed: unknown = JSON.parse(output);
  check(Array.isArray(parsed), "The SSR form parser did not return forms.");
  return parsed as HtmlForm[];
}

function hiddenFields(form: HtmlForm) {
  check(
    form.hidden.some(([name]) => name.startsWith("$ACTION_")),
    "The SSR form has no Next server action metadata."
  );
  const result: Record<string, string> = {};
  for (const [name, value] of form.hidden) {
    check(
      !Object.hasOwn(result, name),
      "The SSR action has duplicate hidden fields."
    );
    result[name] = value;
  }
  return result;
}

async function followLocalRedirects(
  context: APIRequestContext,
  first: APIResponse,
  origin: string
) {
  let response = first;
  for (
    let count = 0;
    count < 6 && [301, 302, 303, 307, 308].includes(response.status());
    count++
  ) {
    const location = response.headers().location;
    check(location, "The server action redirect has no Location.");
    const target = new URL(location, response.url());
    check(
      target.origin === origin,
      "A server action attempted to redirect outside the QA origin."
    );
    response = await context.get(target.href, { maxRedirects: 0 });
  }
  check(
    response.status() === 200,
    "The authenticated action did not finish with HTTP200."
  );
  check(
    new URL(response.url()).origin === origin,
    "The final response escaped the QA origin."
  );
  return response;
}

async function main() {
  check(
    process.env.NODE_TLS_REJECT_UNAUTHORIZED !== "0",
    "TLS certificate validation must remain enabled."
  );
  const target = new URL(process.env.BASE_URL ?? "https://localhost:33443");
  check(
    target.protocol === "https:" &&
      ["localhost", "127.0.0.1"].includes(target.hostname) &&
      !target.username &&
      !target.password &&
      target.origin === (process.env.BASE_URL ?? "https://localhost:33443"),
    "This regression only accepts an exact loopback HTTPS origin."
  );
  check(
    process.env.NODE_EXTRA_CA_CERTS,
    "Launch Node with NODE_EXTRA_CA_CERTS pointing at the local QA CA."
  );
  const caPath = await workFile(process.env.NODE_EXTRA_CA_CERTS);
  const ca = await readFile(caPath, "utf8");
  check(
    ca.includes("-----BEGIN CERTIFICATE-----") &&
      !ca.includes("PRIVATE KEY-----"),
    "NODE_EXTRA_CA_CERTS must contain a public QA certificate, not a private key."
  );
  const accountPath = await workFile(
    process.env.TEST_ACCOUNTS_FILE ?? "work/test-accounts.json"
  );
  const fixture: unknown = JSON.parse(await readFile(accountPath, "utf8"));
  check(
    fixture && typeof fixture === "object",
    "A synthetic account fixture is required."
  );
  const account = fixture as Record<string, unknown>;
  check(
    typeof account.admin === "string" &&
      /^demo_[a-z0-9._-]+$/.test(account.admin),
    "Only a synthetic demo admin is allowed."
  );
  check(
    typeof account.password === "string" && account.password.length >= 12,
    "The synthetic account fixture has no valid password."
  );

  const contexts: APIRequestContext[] = [];
  const makeContext = async (headers?: Record<string, string>) => {
    const context = await request.newContext({
      baseURL: target.origin,
      ignoreHTTPSErrors: false,
      timeout: 20_000,
      extraHTTPHeaders: { Origin: target.origin, ...headers },
    });
    contexts.push(context);
    return context;
  };
  try {
    const session = await makeContext();
    stage = "strict HTTPS sign-in fetch";
    const signIn = await session.get("/sign-in", { maxRedirects: 0 });
    check(
      signIn.status() === 200,
      "Strict HTTPS sign-in did not return HTTP200."
    );
    const login = forms(await signIn.text()).find(
      (form) =>
        form.names.includes("username") && form.names.includes("password")
    );
    check(login, "No server-rendered sign-in form was found.");
    console.log(
      "PASS TLS: sign-in HTTP200 with the supplied QA CA and certificate validation enabled."
    );

    stage = "anonymous API authorization";
    check(
      (await session.get("/api/users", { maxRedirects: 0 })).status() === 401,
      "The anonymous users API did not reject access."
    );
    console.log("PASS guest API: HTTP401 over verified HTTPS.");

    stage = "synthetic admin TLS sign-in";
    const signedIn = await session.post("/sign-in", {
      multipart: {
        ...hiddenFields(login),
        username: account.admin,
        password: account.password,
      },
      maxRedirects: 0,
    });
    check(
      [302, 303].includes(signedIn.status()),
      "TLS sign-in did not produce the expected server action redirect."
    );
    const landing = await followLocalRedirects(
      session,
      signedIn,
      target.origin
    );
    check(
      /^\/(learn|courses)(?:\/|$)/.test(new URL(landing.url()).pathname),
      "TLS sign-in did not reach the learner pages."
    );
    const cookies = (await session.storageState()).cookies;
    const cookie = cookies.find((entry) => entry.name === SESSION_COOKIE);
    check(cookie, "The authenticated HTTPS response stored no session cookie.");
    check(
      cookie.secure &&
        cookie.httpOnly &&
        cookie.sameSite === "Lax" &&
        cookie.path === "/",
      "The HTTPS session cookie flags were incorrect."
    );
    console.log(
      "PASS TLS login: synthetic admin reached learner pages; cookie Secure/HttpOnly/SameSite=Lax."
    );

    stage = "admin API authorization";
    check(
      (await session.get("/api/users", { maxRedirects: 0 })).status() === 200,
      "The authenticated admin users API did not return HTTP200."
    );
    console.log("PASS authenticated admin API: HTTP200 over verified HTTPS.");

    if (process.env.LOCAL_TLS_EXPECTATIONS_FILE) {
      stage = "restored learner/media verification";
      const expected = JSON.parse(
        await readFile(
          await workFile(process.env.LOCAL_TLS_EXPECTATIONS_FILE),
          "utf8"
        )
      ) as {
        learner: { username: string; points: number; completedLessons: number };
        media: { id: string; size: number; sha256: string }[];
      };
      check(
        typeof expected.learner?.username === "string" &&
          Number.isSafeInteger(expected.learner.points) &&
          Number.isSafeInteger(expected.learner.completedLessons) &&
          Array.isArray(expected.media),
        "Invalid restored-data expectations."
      );
      const users = (await (
        await session.get("/api/users", { maxRedirects: 0 })
      ).json()) as {
        username: string;
        points: number;
        completedLessons: number;
      }[];
      const learner = users.find(
        (user) => user.username === expected.learner.username
      );
      check(
        learner?.points === expected.learner.points &&
          learner?.completedLessons === expected.learner.completedLessons,
        "Restored learner points or completed lessons differ."
      );
      for (const file of expected.media) {
        check(
          /^[0-9a-f-]{36}$/.test(file.id) &&
            /^[0-9a-f]{64}$/.test(file.sha256) &&
            Number.isSafeInteger(file.size) &&
            file.size > 16,
          "Invalid restored-media expectation."
        );
        const response = await session.get(`/api/media/${file.id}`, {
          maxRedirects: 0,
        });
        const body = await response.body();
        check(
          response.status() === 200 &&
            body.length === file.size &&
            createHash("sha256").update(body).digest("hex") === file.sha256,
          "Restored media bytes differ or are unreadable."
        );
        const range = await session.get(`/api/media/${file.id}`, {
          headers: { Range: "bytes=0-15" },
          maxRedirects: 0,
        });
        check(
          range.status() === 206 &&
            (await range.body()).equals(body.subarray(0, 16)),
          "Restored media byte range differs."
        );
      }
      console.log(
        `PASS restored data over verified HTTPS: learner points/completions and ${expected.media.length} media files/ranges match.`
      );
    }

    stage = "TLS server action logout";
    const accountPage = await session.get("/account", { maxRedirects: 0 });
    check(
      accountPage.status() === 200,
      "The account page did not return HTTP200."
    );
    const logout = forms(await accountPage.text()).find((form) =>
      form.text.toLocaleLowerCase("vi").includes("đăng xuất")
    );
    check(logout, "No server-rendered logout form was found.");
    const signedOut = await session.post("/account", {
      multipart: hiddenFields(logout),
      maxRedirects: 0,
    });
    check(
      [302, 303].includes(signedOut.status()),
      "TLS logout did not produce the expected server action redirect."
    );
    const exited = await followLocalRedirects(
      session,
      signedOut,
      target.origin
    );
    check(
      new URL(exited.url()).pathname === "/sign-in",
      "TLS logout did not reach sign-in."
    );
    check(
      (await session.get("/api/users", { maxRedirects: 0 })).status() === 401,
      "The logged-out API context retained admin access."
    );

    stage = "revoked HTTPS cookie replay";
    const replay = await makeContext({
      Cookie: `${cookie.name}=${cookie.value}`,
    });
    check(
      (await replay.get("/api/users", { maxRedirects: 0 })).status() === 401,
      "Replaying the pre-logout cookie retained admin access."
    );
    console.log(
      "PASS TLS logout/replay: current context and pre-logout cookie both rejected HTTP401."
    );
    console.log(
      "PASS strict local TLS API regression; no credential or cookie values were printed."
    );
  } finally {
    await Promise.allSettled(contexts.map((context) => context.dispose()));
  }
}

main().catch((error: unknown) => {
  console.error(`FAIL local TLS regression at ${stage}.`);
  console.error(
    error instanceof TlsRegressionError
      ? error.message
      : "Request/parser details suppressed to keep credentials and cookies private."
  );
  process.exitCode = 1;
});
