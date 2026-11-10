import { getEditableLesson, lessonRows, requireAuthor } from "@/lib/content";
import { exportVocabularyCsv } from "@/lib/import-vocabulary";
import { authorError } from "../_shared";

export async function GET(request: Request) {
  try {
    const actor = await requireAuthor();
    const id = Number(new URL(request.url).searchParams.get("lessonId"));
    await getEditableLesson(actor, id);
    return new Response(exportVocabularyCsv(await lessonRows(id)), {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="lesson-${id}.csv"`,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    return authorError(error);
  }
}
