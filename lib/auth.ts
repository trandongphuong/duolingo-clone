import { cache } from "react";

import { and, eq, gt } from "drizzle-orm";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { localUsers, sessions } from "@/db/auth-schema";
import db from "@/db/drizzle";

import {
  createSessionToken,
  hashSessionToken,
  isSessionToken,
  SESSION_COOKIE,
  sessionTtlSeconds,
} from "./session-token";

const getSession = async () => {
  const password = process.env.SESSION_PASSWORD;
  if (!password || password.length < 32)
    throw new Error("SESSION_PASSWORD phải có ít nhất 32 ký tự.");
  return getIronSession<{ token?: string }>(await cookies(), {
    password,
    cookieName: SESSION_COOKIE,
    ttl: sessionTtlSeconds(),
    cookieOptions: {
      httpOnly: true,
      sameSite: "lax",
      secure:
        process.env.SESSION_SECURE === undefined
          ? process.env.NODE_ENV === "production"
          : process.env.SESSION_SECURE !== "false",
      path: "/",
    },
  });
};

export const currentUser = cache(async () => {
  // Avoid requiring session configuration during a guest static build.
  if (!(await cookies()).has(SESSION_COOKIE)) return null;
  const { token } = await getSession();
  if (!token || !isSessionToken(token)) return null;
  const [record] = await db
    .select({
      id: localUsers.id,
      username: localUsers.username,
      firstName: localUsers.displayName,
      role: localUsers.role,
    })
    .from(sessions)
    .innerJoin(localUsers, eq(localUsers.id, sessions.userId))
    .where(
      and(
        eq(sessions.tokenHash, hashSessionToken(token)),
        gt(sessions.expiresAt, new Date()),
        eq(localUsers.active, true)
      )
    )
    .limit(1);
  return record ? { ...record, imageUrl: "/han-ngu-bien.svg" } : null;
});

export const auth = async () => ({ userId: (await currentUser())?.id ?? null });

export const requireUser = async () => {
  const user = await currentUser();
  if (!user) redirect("/sign-in");
  return user;
};

export const startSession = async (
  userId: string,
  verifiedPasswordHash: string
) => {
  const session = await getSession();
  if (session.token && isSessionToken(session.token)) {
    await db
      .delete(sessions)
      .where(eq(sessions.tokenHash, hashSessionToken(session.token)));
  }
  const token = createSessionToken();
  await db.transaction(async (tx) => {
    // A concurrent password reset/disable must not be followed by a new
    // session authenticated using the old password read before bcrypt ran.
    const [user] = await tx
      .select({ id: localUsers.id })
      .from(localUsers)
      .where(
        and(
          eq(localUsers.id, userId),
          eq(localUsers.passwordHash, verifiedPasswordHash),
          eq(localUsers.active, true)
        )
      )
      .for("share");
    if (!user)
      throw new Error("Thông tin đăng nhập đã thay đổi. Vui lòng thử lại.");
    await tx.insert(sessions).values({
      tokenHash: hashSessionToken(token),
      userId,
      expiresAt: new Date(Date.now() + sessionTtlSeconds() * 1000),
    });
  });
  session.token = token;
  await session.save();
};

export const endSession = async () => {
  const session = await getSession();
  if (session.token && isSessionToken(session.token)) {
    await db
      .delete(sessions)
      .where(eq(sessions.tokenHash, hashSessionToken(session.token)));
  }
  session.destroy();
};
