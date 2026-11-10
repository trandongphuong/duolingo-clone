"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import db from "@/db/drizzle";
import {
  challengeProgress,
  challenges,
  reviewSchedules,
  vocabularyEntries,
} from "@/db/schema";
import { auth } from "@/lib/auth";
import { nextReview } from "@/lib/review";
import { gradeAnswerForUser } from "@/lib/learning";

export async function upsertChallengeProgress(
  challengeId: number,
  optionId: number
) {
  const { userId } = await auth();
  if (!userId) throw new Error("Vui lòng đăng nhập.");
  const result = await gradeAnswerForUser(userId, challengeId, optionId);
  for (const path of [
    "/learn",
    "/progress",
    "/review",
    "/leaderboard",
    "/lesson",
    `/lesson/${result.lessonId}`,
  ])
    revalidatePath(path);
  return result;
}

export async function markVocabularyForReview(vocabularyId: number) {
  const { userId } = await auth();
  if (!userId || !Number.isSafeInteger(vocabularyId) || vocabularyId < 1)
    throw new Error("Yêu cầu không hợp lệ.");
  const [word] = await db
    .select({ id: vocabularyEntries.id })
    .from(vocabularyEntries)
    .innerJoin(challenges, eq(challenges.vocabularyId, vocabularyEntries.id))
    .innerJoin(
      challengeProgress,
      and(
        eq(challengeProgress.challengeId, challenges.id),
        eq(challengeProgress.userId, userId),
        eq(challengeProgress.completed, true)
      )
    )
    .where(eq(vocabularyEntries.id, vocabularyId))
    .limit(1);
  if (!word) throw new Error("Chỉ có thể đánh dấu từ đã học của chính bạn.");
  const schedule = nextReview(0, false);
  await db
    .insert(reviewSchedules)
    .values({ userId, vocabularyId, ...schedule })
    .onConflictDoUpdate({
      target: [reviewSchedules.userId, reviewSchedules.vocabularyId],
      set: schedule,
    });
  revalidatePath("/review");
}
