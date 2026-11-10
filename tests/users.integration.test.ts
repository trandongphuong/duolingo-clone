import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

const testUrl = process.env.TEST_DATABASE_URL;

test(
  "PostgreSQL account creation, RBAC, reset/disable and password change revoke sessions",
  { skip: !testUrl, timeout: 120_000 },
  async () => {
    assert.match(
      new URL(testUrl!).pathname,
      /test|e2e/,
      "Chỉ dùng cơ sở dữ liệu kiểm thử dùng một lần."
    );
    process.env.DATABASE_URL = testUrl;
    const { default: db, pool } = await import("../db/drizzle");
    const { localUsers, sessions } = await import("../db/auth-schema");
    const { userProgress } = await import("../db/schema");
    const { and, eq, inArray } = await import("drizzle-orm");
    const { changeOwnPassword, createUser, listUsers, updateUser } =
      await import("../lib/users");
    const { hashPassword, verifyPassword } = await import("../lib/password");
    const { createSessionToken, hashSessionToken } =
      await import("../lib/session-token");
    const suffix = randomUUID().slice(0, 8);
    const adminId = randomUUID();
    const admin = { id: adminId, role: "admin" as const };
    const createdIds: string[] = [adminId];
    const originalPassword = `Only-test-${randomUUID()}`;
    const nextPassword = `Changed-test-${randomUUID()}`;
    const resetPassword = `Reset-test-${randomUUID()}`;

    const addSession = (userId: string) =>
      db.insert(sessions).values({
        userId,
        tokenHash: hashSessionToken(createSessionToken()),
        expiresAt: new Date(Date.now() + 60_000),
      });
    const sessionCount = async (userId: string) =>
      (await db.select().from(sessions).where(eq(sessions.userId, userId)))
        .length;
    try {
      await db.insert(localUsers).values({
        id: adminId,
        username: `account-admin-${suffix}`,
        displayName: "Admin kiểm thử",
        passwordHash: await hashPassword(originalPassword),
        role: "admin",
      });
      const learner = await createUser(admin, {
        username: `account-learner-${suffix}`,
        displayName: "Học viên kiểm thử",
        password: originalPassword,
        role: "learner",
      });
      createdIds.push(learner.id);
      assert.equal(
        "passwordHash" in learner,
        false,
        "API result must not expose hashes"
      );
      assert.equal(learner.active, true);
      await assert.rejects(
        createUser(
          { id: learner.id, role: "learner" },
          {
            username: `forbidden-${suffix}`,
            displayName: "Denied",
            password: originalPassword,
            role: "admin",
          }
        ),
        { status: 403 }
      );
      await assert.rejects(listUsers({ id: learner.id, role: "learner" }), {
        status: 403,
      });
      await assert.rejects(
        updateUser({ id: learner.id, role: "learner" }, adminId, {
          action: "update",
          role: "learner",
        }),
        { status: 403 }
      );
      await assert.rejects(
        createUser(admin, {
          username: learner.username,
          displayName: "Duplicate",
          password: originalPassword,
          role: "author",
        }),
        { status: 409 }
      );
      await db
        .insert(userProgress)
        .values({ userId: learner.id, userName: "Learner test", points: 137 });
      const report = await listUsers(admin);
      const reported = report.find((user) => user.id === learner.id);
      assert.equal(reported?.points, 137);
      assert.equal(reported?.completedLessons, 0);
      assert.equal("passwordHash" in reported!, false);

      await addSession(learner.id);
      await addSession(learner.id);
      assert.equal(await sessionCount(learner.id), 2);
      const disabled = await updateUser(admin, learner.id, {
        action: "update",
        active: false,
      });
      assert.equal(disabled.active, false);
      assert.equal(
        await sessionCount(learner.id),
        0,
        "disable revokes every session"
      );
      await updateUser(admin, learner.id, { action: "update", active: true });
      await addSession(learner.id);
      await updateUser(admin, learner.id, {
        action: "resetPassword",
        password: resetPassword,
      });
      assert.equal(
        await sessionCount(learner.id),
        0,
        "admin reset revokes every session"
      );
      let [stored] = await db
        .select()
        .from(localUsers)
        .where(eq(localUsers.id, learner.id));
      assert.equal(
        await verifyPassword(resetPassword, stored.passwordHash),
        true
      );
      assert.equal(
        await verifyPassword(originalPassword, stored.passwordHash),
        false
      );

      await addSession(learner.id);
      await assert.rejects(
        changeOwnPassword(
          { id: learner.id, role: "learner" },
          { currentPassword: originalPassword, newPassword: nextPassword }
        ),
        { status: 400 }
      );
      assert.equal(
        await sessionCount(learner.id),
        1,
        "wrong current password must not revoke valid sessions or change password"
      );
      await changeOwnPassword(
        { id: learner.id, role: "learner" },
        { currentPassword: resetPassword, newPassword: nextPassword }
      );
      assert.equal(
        await sessionCount(learner.id),
        0,
        "own password change revokes every session"
      );
      [stored] = await db
        .select()
        .from(localUsers)
        .where(eq(localUsers.id, learner.id));
      assert.equal(
        await verifyPassword(nextPassword, stored.passwordHash),
        true
      );
      assert.equal(
        await verifyPassword(resetPassword, stored.passwordHash),
        false
      );
      const [progress] = await db
        .select()
        .from(userProgress)
        .where(eq(userProgress.userId, learner.id));
      assert.equal(
        progress.points,
        137,
        "account changes preserve learning data"
      );

      await addSession(learner.id);
      await updateUser(admin, learner.id, { action: "update", role: "author" });
      assert.equal(
        await sessionCount(learner.id),
        0,
        "role changes revoke old sessions"
      );
      await assert.rejects(
        updateUser(admin, adminId, { action: "update", active: false }),
        { status: 400 }
      );
      const [unchanged] = await db
        .select()
        .from(localUsers)
        .where(
          and(
            eq(localUsers.id, adminId),
            eq(localUsers.active, true),
            eq(localUsers.role, "admin")
          )
        );
      assert.ok(
        unchanged,
        "self-lock rejection is enforced by transactional business layer"
      );

      // A request may capture an admin identity before parsing its body or
      // hashing a password. Revocation must still be checked at the write.
      const secondAdmin = await createUser(admin, {
        username: `account-captured-admin-${suffix}`,
        displayName: "Admin bị thu hồi quyền",
        password: originalPassword,
        role: "admin",
      });
      createdIds.push(secondAdmin.id);
      const capturedActor = { id: secondAdmin.id, role: "admin" as const };
      const forbiddenCreate = (username: string) =>
        createUser(capturedActor, {
          username,
          displayName: "Không được tạo",
          password: originalPassword,
          role: "admin",
        }).then((created) => {
          // Also clean up a row if this assertion catches a regression.
          createdIds.push(created.id);
          return created;
        });
      await updateUser(admin, secondAdmin.id, {
        action: "update",
        active: false,
      });
      await assert.rejects(
        forbiddenCreate(`disabled-actor-created-${suffix}`),
        { status: 403 },
        "a disabled captured admin cannot create accounts"
      );
      await assert.rejects(
        updateUser(capturedActor, adminId, {
          action: "resetPassword",
          password: resetPassword,
        }),
        { status: 403 },
        "a disabled captured admin cannot reset another account"
      );
      await updateUser(admin, secondAdmin.id, {
        action: "update",
        active: true,
        role: "author",
      });
      await assert.rejects(
        forbiddenCreate(`demoted-actor-created-${suffix}`),
        { status: 403 },
        "an active but demoted captured admin cannot create accounts"
      );
      await assert.rejects(
        updateUser(capturedActor, learner.id, {
          action: "update",
          role: "admin",
        }),
        { status: 403 },
        "an active but demoted captured admin cannot grant admin rights"
      );
      const [protectedAdmin] = await db
        .select({ passwordHash: localUsers.passwordHash })
        .from(localUsers)
        .where(eq(localUsers.id, adminId));
      assert.equal(
        await verifyPassword(originalPassword, protectedAdmin.passwordHash),
        true,
        "a revoked actor cannot change an existing admin password"
      );
    } finally {
      await db
        .delete(userProgress)
        .where(inArray(userProgress.userId, createdIds));
      await db.delete(localUsers).where(inArray(localUsers.id, createdIds));
      await pool.end();
    }
  }
);
