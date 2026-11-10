"use server";

import { eq, sql } from "drizzle-orm";
import { redirect } from "next/navigation";

import { localUsers, loginAttempts } from "@/db/auth-schema";
import db from "@/db/drizzle";
import { endSession, startSession } from "@/lib/auth";
import {
  DUMMY_PASSWORD_HASH,
  normalizeUsername,
  verifyPassword,
} from "@/lib/password";

const INVALID_LOGIN =
  "Không thể đăng nhập. Kiểm tra tài khoản, mật khẩu hoặc thử lại sau 15 phút.";
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
export type LoginState = { error: string };

export const signIn = async (
  _previousState: LoginState,
  formData: FormData
): Promise<LoginState> => {
  const rawUsername = formData.get("username");
  const password = formData.get("password");
  if (typeof rawUsername !== "string" || typeof password !== "string")
    return { error: INVALID_LOGIN };
  try {
    const username = normalizeUsername(rawUsername);
    const now = new Date();
    // Count before password verification: atomic across concurrent requests.
    const [attempt] = await db
      .insert(loginAttempts)
      .values({ username, failures: 1, windowStartedAt: now })
      .onConflictDoUpdate({
        target: loginAttempts.username,
        set: {
          failures: sql`CASE WHEN ${loginAttempts.windowStartedAt} <= ${new Date(now.getTime() - LOGIN_WINDOW_MS)} THEN 1 ELSE ${loginAttempts.failures} + 1 END`,
          windowStartedAt: sql`CASE WHEN ${loginAttempts.windowStartedAt} <= ${new Date(now.getTime() - LOGIN_WINDOW_MS)} THEN ${now} ELSE ${loginAttempts.windowStartedAt} END`,
        },
      })
      .returning({ failures: loginAttempts.failures });
    if (attempt.failures > 5) return { error: INVALID_LOGIN };
    const [user] = await db
      .select()
      .from(localUsers)
      .where(eq(localUsers.username, username))
      .limit(1);
    const correct = await verifyPassword(
      password,
      user?.passwordHash ?? DUMMY_PASSWORD_HASH
    );
    if (!user || !user.active || !correct) return { error: INVALID_LOGIN };
    await db.delete(loginAttempts).where(eq(loginAttempts.username, username));
    await startSession(user.id, user.passwordHash);
  } catch (error) {
    // Never log query params, credentials, hashes or session cookies.
    console.error(
      "Internal sign-in failed",
      error instanceof Error ? error.name : "UnknownError"
    );
    return { error: INVALID_LOGIN };
  }
  redirect("/learn");
};

export const signOut = async () => {
  await endSession();
  redirect("/sign-in");
};
