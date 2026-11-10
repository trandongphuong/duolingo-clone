import assert from "node:assert/strict";
import test from "node:test";

import { requireAdminActor, validateAdminTransition } from "../lib/user-policy";

test("only admins may manage users", () => {
  assert.throws(() => requireAdminActor({ id: "1", role: "learner" }), {
    status: 403,
  });
  assert.throws(() => requireAdminActor({ id: "1", role: "author" }), {
    status: 403,
  });
  assert.doesNotThrow(() => requireAdminActor({ id: "1", role: "admin" }));
});

test("account transitions protect self-lock and the last active admin", () => {
  const target = { id: "1", role: "admin" as const, active: true };
  assert.throws(
    () =>
      validateAdminTransition("1", target, { role: "admin", active: false }, 2),
    { status: 400 }
  );
  assert.throws(
    () =>
      validateAdminTransition(
        "1",
        target,
        { role: "learner", active: true },
        1
      ),
    { status: 400 }
  );
  assert.throws(
    () =>
      validateAdminTransition("2", target, { role: "admin", active: false }, 1),
    { status: 400 }
  );
  assert.doesNotThrow(() =>
    validateAdminTransition("1", target, { role: "author", active: true }, 2)
  );
  assert.doesNotThrow(() =>
    validateAdminTransition("2", target, { role: "admin", active: false }, 2)
  );
});
