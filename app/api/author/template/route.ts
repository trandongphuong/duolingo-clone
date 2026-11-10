import { readFile } from "node:fs/promises";
import path from "node:path";
import { requireAuthor } from "@/lib/content";
import { authorError } from "../_shared";

export async function GET() {
  try {
    await requireAuthor();
    const csv = await readFile(
      path.join(process.cwd(), "templates", "vocabulary_sample.csv"),
      "utf8"
    );
    return new Response(`\uFEFF${csv}`, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": "attachment; filename=han-ngu-bien-mau.csv",
      },
    });
  } catch (error) {
    return authorError(error);
  }
}
