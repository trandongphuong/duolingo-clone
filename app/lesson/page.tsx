import { redirect } from "next/navigation";
import { getLesson } from "@/db/queries";
import { requireUser } from "@/lib/auth";

export default async function LessonPage() {
  await requireUser();
  const lesson = await getLesson();
  if (!lesson) redirect("/learn");
  redirect(`/lesson/${lesson.id}`);
}
