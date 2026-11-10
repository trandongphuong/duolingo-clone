import { randomUUID } from "node:crypto";

import { and, count, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { localUsers, loginAttempts, sessions } from "@/db/auth-schema";
import db from "@/db/drizzle";
import { courses, userProgress } from "@/db/schema";

import { hashPassword, normalizeUsername, verifyPassword } from "./password";
import {
  requireAdminActor,
  UserManagementError,
  validateAdminTransition,
  type UserActor,
} from "./user-policy";

const roleSchema = z.enum(["learner", "author", "admin"]);
export const createUserSchema = z
  .object({
    username: z.string().min(3).max(64),
    displayName: z.string().trim().min(1).max(100),
    password: z.string().min(12).max(72),
    role: roleSchema,
  })
  .strict();

export const updateUserSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("update"),
      displayName: z.string().trim().min(1).max(100).optional(),
      role: roleSchema.optional(),
      active: z.boolean().optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal("resetPassword"),
      password: z.string().min(12).max(72),
    })
    .strict(),
]);

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1).max(72),
    newPassword: z.string().min(12).max(72),
  })
  .strict();

const publicUserColumns = {
  id: localUsers.id,
  username: localUsers.username,
  displayName: localUsers.displayName,
  role: localUsers.role,
  active: localUsers.active,
  createdAt: localUsers.createdAt,
  updatedAt: localUsers.updatedAt,
};

type UserTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function lockAdminActor(tx: UserTransaction, actor: UserActor) {
  // All account administration takes this lock before locking any user row.
  // An actor captured before body parsing/password hashing may since have been
  // disabled or demoted; request-time authentication alone is insufficient.
  await tx.execute(sql`select pg_advisory_xact_lock(748201)`);
  const [current] = await tx
    .select({ id: localUsers.id })
    .from(localUsers)
    .where(
      and(
        eq(localUsers.id, actor.id),
        eq(localUsers.active, true),
        eq(localUsers.role, "admin")
      )
    )
    .for("share");
  if (!current)
    throw new UserManagementError("Không còn quyền quản trị tài khoản.", 403);
}

export const listUsers = async (actor: UserActor) => {
  requireAdminActor(actor);
  return db
    .select({
      ...publicUserColumns,
      courseTitle: courses.title,
      points: sql<number>`coalesce(${userProgress.points}, 0)::int`,
      completedLessons: sql<number>`(select count(*)::int from lessons l where exists (select 1 from challenges c where c.lesson_id = l.id) and not exists (select 1 from challenges c where c.lesson_id = l.id and not exists (select 1 from challenge_progress cp where cp.challenge_id = c.id and cp.user_id = ${localUsers.id} and cp.completed = true)))`,
    })
    .from(localUsers)
    .leftJoin(userProgress, eq(userProgress.userId, localUsers.id))
    .leftJoin(courses, eq(courses.id, userProgress.activeCourseId))
    .orderBy(localUsers.username);
};

export const createUser = async (actor: UserActor, input: unknown) => {
  requireAdminActor(actor);
  const data = createUserSchema.parse(input);
  const username = normalizeUsername(data.username);
  const passwordHash = await hashPassword(data.password);
  const created = await db.transaction(async (tx) => {
    await lockAdminActor(tx, actor);
    const [result] = await tx
      .insert(localUsers)
      .values({
        id: randomUUID(),
        username,
        displayName: data.displayName,
        passwordHash,
        role: data.role,
      })
      .onConflictDoNothing({ target: localUsers.username })
      .returning(publicUserColumns);
    if (!result)
      throw new UserManagementError("Tên đăng nhập đã tồn tại.", 409);
    return result;
  });
  console.info("account.created", {
    actor: actor.id,
    userId: created.id,
    role: created.role,
  });
  return created;
};

export const updateUser = async (
  actor: UserActor,
  id: string,
  input: unknown
) => {
  requireAdminActor(actor);
  const data = updateUserSchema.parse(input);
  const passwordHash =
    data.action === "resetPassword"
      ? await hashPassword(data.password)
      : undefined;
  const updated = await db.transaction(async (tx) => {
    // Revalidate the actor under the same lock that serializes role changes.
    await lockAdminActor(tx, actor);
    const [target] = await tx
      .select()
      .from(localUsers)
      .where(eq(localUsers.id, id))
      .for("update");
    if (!target)
      throw new UserManagementError("Không tìm thấy tài khoản.", 404);
    if (data.action === "resetPassword") {
      const [result] = await tx
        .update(localUsers)
        .set({ passwordHash, updatedAt: new Date() })
        .where(eq(localUsers.id, id))
        .returning(publicUserColumns);
      await tx.delete(sessions).where(eq(sessions.userId, id));
      await tx
        .delete(loginAttempts)
        .where(eq(loginAttempts.username, target.username));
      return result;
    }
    const [{ total }] = await tx
      .select({ total: count() })
      .from(localUsers)
      .where(and(eq(localUsers.role, "admin"), eq(localUsers.active, true)));
    const next = {
      role: data.role ?? target.role,
      active: data.active ?? target.active,
    };
    validateAdminTransition(actor.id, target, next, total);
    const [result] = await tx
      .update(localUsers)
      .set({
        ...next,
        displayName: data.displayName ?? target.displayName,
        updatedAt: new Date(),
      })
      .where(eq(localUsers.id, id))
      .returning(publicUserColumns);
    if (!next.active || next.role !== target.role)
      await tx.delete(sessions).where(eq(sessions.userId, id));
    return result;
  });
  console.info(`account.${data.action}`, { actor: actor.id, userId: id });
  return updated;
};

export const changeOwnPassword = async (actor: UserActor, input: unknown) => {
  const data = changePasswordSchema.parse(input);
  const nextHash = await hashPassword(data.newPassword);
  await db.transaction(async (tx) => {
    const [user] = await tx
      .select()
      .from(localUsers)
      .where(eq(localUsers.id, actor.id))
      .for("update");
    if (
      !user ||
      !user.active ||
      !(await verifyPassword(data.currentPassword, user.passwordHash))
    ) {
      throw new UserManagementError("Mật khẩu hiện tại không đúng.", 400);
    }
    await tx
      .update(localUsers)
      .set({ passwordHash: nextHash, updatedAt: new Date() })
      .where(eq(localUsers.id, actor.id));
    await tx.delete(sessions).where(eq(sessions.userId, actor.id));
  });
  console.info("account.passwordChanged", { userId: actor.id });
};
