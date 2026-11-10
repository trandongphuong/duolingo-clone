import { and, asc, eq, sql } from "drizzle-orm";
import { z } from "zod";

import db from "@/db/drizzle";
import {
  challengeOptions,
  challengeProgress,
  challenges,
  courses,
  exerciseAttempts,
  lessons,
  reviewSchedules,
  units,
  userProgress,
  vocabularyEntries,
} from "@/db/schema";
import { nextReview } from "@/lib/review";

const answerSchema = z.object({
  challengeId: z.number().int().positive(),
  optionId: z.number().int().positive(),
});

/** Internal worker: caller must supply the authenticated user ID. Never export as a server action. */
export async function gradeAnswerForUser(
  userId: string,
  challengeId: number,
  optionId: number
) {
  const answer = answerSchema.parse({ challengeId, optionId });
  return db.transaction(async (tx) => {
    const [question] = await tx
      .select({
        id: challenges.id,
        vocabularyId: challenges.vocabularyId,
        lessonId: lessons.id,
        courseId: courses.id,
        correct: challengeOptions.correct,
      })
      .from(challenges)
      .innerJoin(lessons, eq(challenges.lessonId, lessons.id))
      .innerJoin(units, eq(lessons.unitId, units.id))
      .innerJoin(courses, eq(units.courseId, courses.id))
      .innerJoin(
        challengeOptions,
        and(
          eq(challengeOptions.challengeId, challenges.id),
          eq(challengeOptions.id, answer.optionId)
        )
      )
      .where(
        and(
          eq(challenges.id, answer.challengeId),
          eq(lessons.status, "published"),
          eq(courses.status, "published")
        )
      );
    if (!question) throw new Error("Câu hỏi hoặc đáp án không hợp lệ.");
    const [learner] = await tx
      .select()
      .from(userProgress)
      .where(eq(userProgress.userId, userId))
      .for("update");
    if (!learner || learner.activeCourseId !== question.courseId)
      throw new Error("Khóa học chưa được chọn.");
    await tx
      .insert(exerciseAttempts)
      .values({ userId, challengeId, optionId, isCorrect: question.correct });
    let awardedPoints = 0;
    if (question.correct) {
      const inserted = await tx
        .insert(challengeProgress)
        .values({ userId, challengeId, completed: true })
        .onConflictDoUpdate({
          target: [challengeProgress.userId, challengeProgress.challengeId],
          set: { completed: true },
          setWhere: eq(challengeProgress.completed, false),
        })
        .returning({ id: challengeProgress.id });
      if (inserted.length) {
        awardedPoints = 10;
        await tx
          .update(userProgress)
          .set({ points: sql`${userProgress.points} + 10` })
          .where(eq(userProgress.userId, userId));
      }
    }
    // The user progress row lock serializes grading. Only a due review can advance again.
    if (question.vocabularyId) {
      const existing = await tx.query.reviewSchedules.findFirst({
        where: and(
          eq(reviewSchedules.userId, userId),
          eq(reviewSchedules.vocabularyId, question.vocabularyId)
        ),
      });
      if (
        !question.correct ||
        !existing ||
        existing.dueAt.getTime() <= Date.now()
      ) {
        const schedule = nextReview(existing?.step ?? 0, question.correct);
        await tx
          .insert(reviewSchedules)
          .values({ userId, vocabularyId: question.vocabularyId, ...schedule })
          .onConflictDoUpdate({
            target: [reviewSchedules.userId, reviewSchedules.vocabularyId],
            set: schedule,
          });
      }
    }
    return {
      correct: question.correct,
      awardedPoints,
      points: learner.points + awardedPoints,
      lessonId: question.lessonId,
    };
  });
}

/** Answer keys are excluded at SQL projection time, before any learner payload is created. */
export async function loadLearnerLesson(userId: string, lessonId: number) {
  const progress = await db.query.userProgress.findFirst({
    where: eq(userProgress.userId, userId),
    with: { activeCourse: true },
  });
  if (
    !progress?.activeCourseId ||
    progress.activeCourse?.status !== "published"
  )
    return null;
  const data = await db.query.lessons.findFirst({
    where: and(eq(lessons.id, lessonId), eq(lessons.status, "published")),
    with: {
      unit: true,
      vocabulary: {
        orderBy: [asc(vocabularyEntries.order), asc(vocabularyEntries.id)],
      },
      challenges: {
        orderBy: [asc(challenges.order), asc(challenges.id)],
        with: {
          challengeOptions: {
            columns: {
              id: true,
              challengeId: true,
              text: true,
              imageSrc: true,
              audioSrc: true,
            },
            orderBy: (options, { asc }) => [asc(options.id)],
          },
          challengeProgress: { where: eq(challengeProgress.userId, userId) },
        },
      },
    },
  });
  if (!data || data.unit.courseId !== progress.activeCourseId) return null;
  return {
    id: data.id,
    title: data.title,
    description: data.description,
    version: data.version,
    vocabulary: data.vocabulary,
    sampleUnreviewed: progress.activeCourse.sampleUnreviewed,
    challenges: data.challenges.map((challenge) => ({
      id: challenge.id,
      question: challenge.question,
      type: challenge.type,
      vocabularyId: challenge.vocabularyId,
      completed: challenge.challengeProgress.some((item) => item.completed),
      challengeOptions: challenge.challengeOptions,
    })),
  };
}
