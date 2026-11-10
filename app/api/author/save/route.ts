import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { requireAuthor, saveRows } from "@/lib/content";
import { authorError, mutationBody } from "../_shared";

export async function POST(request: Request) {
  try {
    const actor = await requireAuthor();
    const result = await saveRows(actor, await mutationBody(request));
    revalidatePath("/author");
    return NextResponse.json(result);
  } catch (error) {
    return authorError(error);
  }
}
