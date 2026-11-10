"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { MAX_HEARTS } from "@/constants";
import db from "@/db/drizzle";
import { getCourseById } from "@/db/queries";
import { courses, lessons, units, userProgress } from "@/db/schema";
import { auth, currentUser } from "@/lib/auth";

export async function upsertUserProgress(courseId: number) {
  if (!Number.isSafeInteger(courseId) || courseId < 1) throw new Error("Mã khóa học không hợp lệ.");
  const { userId } = await auth();
  const user = await currentUser();
  if (!userId || !user) throw new Error("Vui lòng đăng nhập.");
  const course = await getCourseById(courseId);
  if (!course || !course.units.some((unit) => unit.lessons.length))
    throw new Error("Khóa học chưa có bài được xuất bản.");
  const profile = {
    activeCourseId: courseId,
    userName: user.firstName || "Học viên",
    userImageSrc: user.imageUrl || "/han-ngu-bien.svg",
  };
  await db
    .insert(userProgress)
    .values({ userId, ...profile })
    .onConflictDoUpdate({ target: userProgress.userId, set: profile });
  revalidatePath("/courses");
  revalidatePath("/learn");
  return { nextPath: "/learn" as const };
}

// Retained for legacy widgets. Practice has no paid limits and never deducts points.
export async function refillHearts() {
  const { userId } = await auth();
  if (!userId) throw new Error("Vui lòng đăng nhập.");
  await db
    .update(userProgress)
    .set({ hearts: MAX_HEARTS })
    .where(eq(userProgress.userId, userId));
  revalidatePath("/learn");
}

export async function startReviewLesson(lessonId: number) {
  const user = await currentUser();
  if (!user || !Number.isSafeInteger(lessonId) || lessonId < 1)
    throw new Error("Yêu cầu không hợp lệ.");
  const [lesson] = await db
    .select({ id: lessons.id, courseId: courses.id })
    .from(lessons)
    .innerJoin(units, eq(lessons.unitId, units.id))
    .innerJoin(courses, eq(units.courseId, courses.id))
    .where(
      and(
        eq(lessons.id, lessonId),
        eq(lessons.status, "published"),
        eq(courses.status, "published")
      )
    );
  if (!lesson) throw new Error("Bài học chưa được xuất bản.");
  const profile = {
    activeCourseId: lesson.courseId,
    userName: user.firstName,
    userImageSrc: user.imageUrl,
  };
  await db
    .insert(userProgress)
    .values({ userId: user.id, ...profile })
    .onConflictDoUpdate({ target: userProgress.userId, set: profile });
  revalidatePath("/learn");
  redirect(`/lesson/${lesson.id}?review=1`);
}
