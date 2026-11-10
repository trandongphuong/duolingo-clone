import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { requireAuthor, transitionLesson } from "@/lib/content";
import { authorError, mutationBody } from "../_shared";

export async function POST(request: Request) {
  try {
    const actor = await requireAuthor();
    const result = await transitionLesson(actor, await mutationBody(request));
    for (const path of ["/author", "/courses", "/learn"]) revalidatePath(path);
    return NextResponse.json(result);
  } catch (error) {
    return authorError(error);
  }
}
