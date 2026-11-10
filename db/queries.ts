import { cache } from "react";
import { and, asc, desc, eq, lte, sql } from "drizzle-orm";

import { auth } from "@/lib/auth";
import { loadLearnerLesson } from "@/lib/learning";
import db from "./drizzle";
import {
  challengeProgress,
  challenges,
  courses,
  exerciseAttempts,
  lessons,
  reviewSchedules,
  units,
  userProgress,
  vocabularyEntries,
} from "./schema";

export const getCourses = cache(async () => {
  const { userId } = await auth();
  if (!userId) return [];
  return db.query.courses.findMany({
    where: eq(courses.status, "published"),
    orderBy: [asc(courses.id)],
  });
});

export const getUserProgress = cache(async () => {
  const { userId } = await auth();
  if (!userId) return null;
  return db.query.userProgress.findFirst({
    where: eq(userProgress.userId, userId),
    with: { activeCourse: true },
  });
});

export const getUnits = cache(async () => {
  const { userId } = await auth();
  const progress = await getUserProgress();
  if (
    !userId ||
    !progress?.activeCourseId ||
    progress.activeCourse?.status !== "published"
  )
    return [];
  const rows = await db.query.units.findMany({
    where: eq(units.courseId, progress.activeCourseId),
    orderBy: [asc(units.order), asc(units.id)],
    with: {
      lessons: {
        where: eq(lessons.status, "published"),
        orderBy: [asc(lessons.order), asc(lessons.id)],
        with: {
          challenges: {
            orderBy: [asc(challenges.order)],
            with: {
              challengeProgress: {
                where: eq(challengeProgress.userId, userId),
              },
            },
          },
        },
      },
    },
  });
  return rows.map((unit) => ({
    ...unit,
    lessons: unit.lessons.map((lesson) => ({
      ...lesson,
      completed:
        lesson.challenges.length > 0 &&
        lesson.challenges.every((challenge) =>
          challenge.challengeProgress.some((item) => item.completed)
        ),
    })),
  }));
});

export const getCourseById = cache(async (courseId: number) => {
  const { userId } = await auth();
  if (!userId || !Number.isSafeInteger(courseId) || courseId < 1) return null;
  return db.query.courses.findFirst({
    where: and(eq(courses.id, courseId), eq(courses.status, "published")),
    with: {
      units: {
        orderBy: [asc(units.order)],
        with: {
          lessons: {
            where: eq(lessons.status, "published"),
            orderBy: [asc(lessons.order)],
          },
        },
      },
    },
  });
});

export const getCourseProgress = cache(async () => {
  const unitsData = await getUnits();
  const allLessons = unitsData.flatMap((unit) =>
    unit.lessons.map((lesson) => ({ ...lesson, unit }))
  );
  const activeLesson = allLessons.find(
    (lesson) => !lesson.completed && lesson.challenges.length > 0
  );
  return {
    activeLesson,
    activeLessonId: activeLesson?.id,
    totalLessons: allLessons.length,
    completedLessons: allLessons.filter((lesson) => lesson.completed).length,
  };
});

/** Explicit projections prevent answer keys entering the React Server Component payload. */
export const getLesson = cache(async (id?: number) => {
  const { userId } = await auth();
  const progress = await getUserProgress();
  if (
    !userId ||
    !progress?.activeCourseId ||
    progress.activeCourse?.status !== "published"
  )
    return null;
  const lessonId = id ?? (await getCourseProgress()).activeLessonId;
  if (!lessonId || !Number.isSafeInteger(lessonId) || lessonId < 1) return null;
  return loadLearnerLesson(userId, lessonId);
});

export type LearnerLesson = NonNullable<Awaited<ReturnType<typeof getLesson>>>;

export const getLessonPercentage = cache(async () => {
  const lesson = await getLesson();
  if (!lesson?.challenges.length) return 0;
  return Math.round(
    (lesson.challenges.filter((item) => item.completed).length /
      lesson.challenges.length) *
      100
  );
});

// Compatibility for legacy sidebar widgets: all local learners have unrestricted practice.
export const getUserSubscription = cache(async () => {
  const { userId } = await auth();
  return userId ? { isActive: true } : null;
});

export const getTopTenUsers = cache(async () => {
  const { userId } = await auth();
  if (!userId) return [];
  return db.query.userProgress.findMany({
    orderBy: [desc(userProgress.points)],
    limit: 10,
    columns: { userId: true, userName: true, userImageSrc: true, points: true },
  });
});

export const getDueReviews = cache(async () => {
  const { userId } = await auth();
  if (!userId) return [];
  return db
    .select({
      id: reviewSchedules.id,
      step: reviewSchedules.step,
      dueAt: reviewSchedules.dueAt,
      vocabulary: vocabularyEntries,
      lessonTitle: lessons.title,
    })
    .from(reviewSchedules)
    .innerJoin(
      vocabularyEntries,
      eq(reviewSchedules.vocabularyId, vocabularyEntries.id)
    )
    .innerJoin(lessons, eq(vocabularyEntries.lessonId, lessons.id))
    .innerJoin(units, eq(lessons.unitId, units.id))
    .innerJoin(courses, eq(units.courseId, courses.id))
    .where(
      and(
        eq(reviewSchedules.userId, userId),
        lte(reviewSchedules.dueAt, new Date()),
        eq(lessons.status, "published"),
        eq(courses.status, "published")
      )
    )
    .orderBy(asc(reviewSchedules.dueAt))
    .limit(100);
});

export const getAttemptSummary = cache(async () => {
  const { userId } = await auth();
  if (!userId) return { total: 0, correct: 0 };
  const [summary] = await db
    .select({
      total: sql<number>`count(*)::int`,
      correct: sql<number>`count(*) filter (where ${exerciseAttempts.isCorrect})::int`,
    })
    .from(exerciseAttempts)
    .where(eq(exerciseAttempts.userId, userId));
  return summary ?? { total: 0, correct: 0 };
});
