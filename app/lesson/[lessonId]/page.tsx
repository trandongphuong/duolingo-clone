import { notFound } from "next/navigation";
import { getLesson } from "@/db/queries";
import { requireUser } from "@/lib/auth";
import { Quiz } from "../quiz";

export default async function LessonIdPage({
  params,
  searchParams,
}: {
  params: Promise<{ lessonId: string }>;
  searchParams: Promise<{ review?: string }>;
}) {
  await requireUser();
  const { lessonId } = await params;
  if (!/^\d+$/.test(lessonId)) notFound();
  const lesson = await getLesson(Number(lessonId));
  if (!lesson) notFound();
  const reviewMode = (await searchParams).review === "1";
  return (
    <Quiz
      key={`${lesson.id}-${reviewMode}`}
      lesson={lesson}
      reviewMode={reviewMode}
    />
  );
}
