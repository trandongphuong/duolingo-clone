import { NextResponse } from "next/server";
import { getEditableLesson, lessonRows, requireAuthor } from "@/lib/content";
import { authorError } from "../_shared";

export async function GET(request: Request) {
  try {
    const actor = await requireAuthor();
    const id = Number(new URL(request.url).searchParams.get("lessonId"));
    const lesson = await getEditableLesson(actor, id);
    return NextResponse.json({ lesson, rows: await lessonRows(id) });
  } catch (error) {
    return authorError(error);
  }
}
