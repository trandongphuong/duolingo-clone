import assert from "node:assert/strict";
import test from "node:test";

import {
  hashPassword,
  normalizeUsername,
  verifyPassword,
} from "../lib/password";
import {
  createSessionToken,
  hashSessionToken,
  isSessionToken,
} from "../lib/session-token";

test("salted bcrypt hashes verify Unicode passwords and reject wrong values", async () => {
  const password = "Học tiếng Trung 2026!";
  const first = await hashPassword(password);
  const second = await hashPassword(password);
  assert.notEqual(first, second);
  assert.equal(await verifyPassword(password, first), true);
  assert.equal(await verifyPassword(password + "!", first), false);
  assert.equal(await verifyPassword(password, "invalid"), false);
});

test("password and username limits prevent bcrypt truncation and invalid account IDs", async () => {
  await assert.rejects(hashPassword("short"));
  await assert.rejects(hashPassword("a".repeat(73)));
  await assert.rejects(hashPassword("海".repeat(25)));
  assert.equal(normalizeUsername("  Hoa.Vien  "), "hoa.vien");
  assert.throws(() => normalizeUsername("x"));
  assert.throws(() => normalizeUsername("../../admin"));
  assert.throws(() => normalizeUsername("a".repeat(65)));
});

test("sessions use random opaque tokens and deterministic one-way database digests", () => {
  const first = createSessionToken();
  const second = createSessionToken();
  assert.equal(isSessionToken(first), true);
  assert.notEqual(first, second);
  assert.notEqual(hashSessionToken(first), first);
  assert.equal(hashSessionToken(first), hashSessionToken(first));
  assert.notEqual(hashSessionToken(first), hashSessionToken(second));
  assert.equal(isSessionToken("../"), false);
  assert.equal(isSessionToken(first.slice(1)), false);
});
