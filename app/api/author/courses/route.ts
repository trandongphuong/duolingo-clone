import { NextResponse } from "next/server";
import {
  createAuthorLesson,
  listAuthorCourses,
  requireAuthor,
} from "@/lib/content";
import { authorError, mutationBody } from "../_shared";

export async function GET() {
  try {
    return NextResponse.json(await listAuthorCourses(await requireAuthor()));
  } catch (error) {
    return authorError(error);
  }
}
export async function POST(request: Request) {
  try {
    const actor = await requireAuthor();
    return NextResponse.json(
      await createAuthorLesson(actor, await mutationBody(request)),
      { status: 201 }
    );
  } catch (error) {
    return authorError(error);
  }
}
