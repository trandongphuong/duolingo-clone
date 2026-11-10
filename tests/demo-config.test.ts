import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";

import { DemoConfigError, readDemoConfig } from "../lib/demo-config";

const environment = () => ({
  DEMO_MODE: "true",
  DEMO_DATA_POLICY: "SYNTHETIC_ONLY",
  DATABASE_URL: "postgresql://demo_user@localhost/hnb_demo?sslmode=require",
  SESSION_PASSWORD: randomBytes(32).toString("hex"),
  APP_ORIGIN: "https://demo.example.test",
  SESSION_SECURE: "true",
  DEMO_ADMIN_PASSWORD: randomBytes(24).toString("hex"),
});

test("demo configuration requires explicit synthetic-only mode before other work", () => {
  for (const overrides of [
    { DEMO_MODE: undefined },
    { DEMO_MODE: "false" },
    { DEMO_MODE: "TRUE" },
    { DEMO_DATA_POLICY: undefined },
    { DEMO_DATA_POLICY: "REAL_DATA" },
  ]) {
    assert.throws(
      () => readDemoConfig({ ...environment(), ...overrides }),
      DemoConfigError
    );
  }
});

test("demo configuration accepts a dedicated PostgreSQL database and normalizes the account", () => {
  const input = { ...environment(), DEMO_ADMIN_USERNAME: "  Demo.Admin  " };
  const result = readDemoConfig(input);
  assert.equal(result.databaseName, "hnb_demo");
  assert.equal(result.databaseUrl, input.DATABASE_URL);
  assert.equal(result.appOrigin, input.APP_ORIGIN);
  assert.equal(result.adminUsername, "demo.admin");
  assert.equal(result.adminPassword, input.DEMO_ADMIN_PASSWORD);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(readDemoConfig(environment()).adminUsername, "demo_admin");
});

test("database guard rejects non-demo targets and query overrides without leaking the URL", () => {
  for (const databaseUrl of [
    "",
    "not-a-url",
    "https://user:secret@db.example.test/hnb_demo",
    "postgresql://user:secret@db.example.test/production",
    "postgresql://user:secret@db.example.test/demo/production",
    "postgresql://user:secret@db.example.test/hnb_demo?database=production",
    "postgresql://user:secret@db.example.test/hnb_demo?dbname=production",
    "postgresql://user:secret@db.example.test/hnb_demo?DBNAME=production",
    "postgresql://user:secret@db.example.test/hnb_demo#fragment",
    "postgresql://user:secret@db.example.test/%ZZdemo",
  ]) {
    assert.throws(
      () => readDemoConfig({ ...environment(), DATABASE_URL: databaseUrl }),
      (error: unknown) =>
        error instanceof DemoConfigError &&
        !error.message.includes("secret") &&
        !error.message.includes("db.example.test")
    );
  }
  assert.equal(
    readDemoConfig({
      ...environment(),
      DATABASE_URL: "postgres://localhost/hnb_%64emo",
    }).databaseName,
    "hnb_demo"
  );
});

test("public demo requires a canonical HTTPS origin and secure session cookies", () => {
  for (const appOrigin of [
    undefined,
    "http://demo.example.test",
    "https://demo.example.test/",
    "https://demo.example.test/sign-in",
    "https://demo.example.test?query=value",
    "https://demo.example.test#fragment",
    "https://user:secret@demo.example.test",
    "https://DEMO.example.test",
    "null",
  ]) {
    assert.throws(
      () => readDemoConfig({ ...environment(), APP_ORIGIN: appOrigin }),
      DemoConfigError
    );
  }
  for (const secure of ["false", "FALSE", "0", ""]) {
    assert.throws(
      () => readDemoConfig({ ...environment(), SESSION_SECURE: secure }),
      DemoConfigError
    );
  }
  assert.doesNotThrow(() =>
    readDemoConfig({ ...environment(), SESSION_SECURE: undefined })
  );
  assert.doesNotThrow(() =>
    readDemoConfig({
      ...environment(),
      APP_ORIGIN: "https://demo.example.test:8443",
    })
  );
});

test("demo credentials obey session, username, and bcrypt UTF-8 boundaries", () => {
  const privatePassword = randomBytes(24).toString("hex");
  for (const overrides of [
    { SESSION_PASSWORD: undefined },
    { SESSION_PASSWORD: "x".repeat(31) },
    { DEMO_ADMIN_PASSWORD: undefined },
    { DEMO_ADMIN_PASSWORD: "x".repeat(11) },
    { DEMO_ADMIN_PASSWORD: "x".repeat(73) },
    { DEMO_ADMIN_PASSWORD: "海".repeat(25) },
    { DEMO_ADMIN_USERNAME: "../admin" },
    { DEMO_ADMIN_USERNAME: "a".repeat(65) },
  ]) {
    assert.throws(
      () =>
        readDemoConfig({
          ...environment(),
          DEMO_ADMIN_PASSWORD: privatePassword,
          ...overrides,
        }),
      (error: unknown) =>
        error instanceof DemoConfigError &&
        !error.message.includes(privatePassword)
    );
  }
  assert.doesNotThrow(() =>
    readDemoConfig({
      ...environment(),
      SESSION_PASSWORD: "x".repeat(32),
      DEMO_ADMIN_PASSWORD: "海".repeat(24),
    })
  );
});
