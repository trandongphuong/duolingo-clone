import { NextResponse } from "next/server";
import { ContentError, previewRows, requireAuthor } from "@/lib/content";
import {
  parseVocabularyFile,
  parseVocabularyText,
} from "@/lib/import-vocabulary";
import { authorError, mutationBody } from "../_shared";

export async function POST(request: Request) {
  try {
    const actor = await requireAuthor();
    if (request.headers.get("content-type")?.includes("multipart/form-data")) {
      const form = (await mutationBody(request, true)) as FormData;
      const file = form.get("file");
      if (!(file instanceof File))
        throw new ContentError("Hãy chọn tệp CSV hoặc XLSX.");
      const parsed = await parseVocabularyFile(
        new Uint8Array(await file.arrayBuffer()),
        file.name
      );
      const preview = await previewRows(
        actor,
        Number(form.get("lessonId")),
        parsed.rows
      );
      preview.issues = [...parsed.issues, ...preview.issues];
      preview.warnings = [...parsed.warnings, ...preview.warnings];
      if (preview.issues.length) preview.receipt = null;
      return NextResponse.json(preview);
    }
    const body = await mutationBody(request);
    if (!body || !Number.isSafeInteger(body.lessonId) || body.lessonId < 1)
      throw new ContentError("Hãy chọn bài học trước khi nhập.");
    if (Array.isArray(body.rows))
      return NextResponse.json(
        await previewRows(actor, body.lessonId, body.rows)
      );
    if (typeof body.text !== "string")
      throw new ContentError("Thiếu bảng từ cần nhập.");
    const parsed = parseVocabularyText(
      body.text,
      body.format === "tsv" ? "tsv" : body.format === "csv" ? "csv" : undefined
    );
    const preview = await previewRows(actor, body.lessonId, parsed.rows);
    preview.issues = [...parsed.issues, ...preview.issues];
    preview.warnings = [...parsed.warnings, ...preview.warnings];
    if (preview.issues.length) preview.receipt = null;
    return NextResponse.json(preview);
  } catch (error) {
    return authorError(error);
  }
}
