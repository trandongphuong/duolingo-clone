import { NextResponse } from "next/server";
import { ContentError } from "@/lib/content";
import { assertSameOrigin } from "@/lib/security";
import { ActorWriteError } from "@/lib/write-actor";

export const MAX_BODY_BYTES = 6 * 1024 * 1024;

export async function mutationBody(request: Request, multipart = false) {
  const limit = multipart ? MAX_BODY_BYTES : 5 * 1024 * 1024;
  try {
    await assertSameOrigin(request);
  } catch {
    throw new ContentError("Yêu cầu khác nguồn bị từ chối.", 403);
  }
  if (Number(request.headers.get("content-length")) > limit)
    throw new ContentError("Tệp hoặc dữ liệu vượt giới hạn 5MB.", 413);
  const reader = request.body?.getReader();
  if (!reader) throw new ContentError("Yêu cầu thiếu dữ liệu.");
  const parts: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new ContentError("Tệp hoặc dữ liệu vượt giới hạn 5MB.", 413);
      }
      parts.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const buffer = Buffer.concat(parts);
  if (multipart)
    return new Request(request.url, {
      method: "POST",
      headers: { "content-type": request.headers.get("content-type") || "" },
      body: buffer,
    }).formData();
  try {
    return JSON.parse(buffer.toString("utf8"));
  } catch {
    throw new ContentError("JSON không hợp lệ.");
  }
}

export function authorError(error: unknown) {
  if (error instanceof ContentError || error instanceof ActorWriteError)
    return NextResponse.json(
      { error: error.message },
      { status: error.status }
    );
  if (
    error instanceof Error &&
    (error.message === "Forbidden" || /origin|csrf/i.test(error.message))
  )
    return NextResponse.json(
      { error: "Yêu cầu khác origin không được phép." },
      { status: 403 }
    );
  // PostgreSQL unique constraints should be useful to an author without revealing DB internals.
  const cause =
    error instanceof Error
      ? (error.cause as { code?: string } | undefined)
      : undefined;
  if (cause?.code === "23505" || (error as { code?: string })?.code === "23505")
    return NextResponse.json(
      { error: "Mã khóa đã tồn tại. Hãy chọn mã khác." },
      { status: 409 }
    );
  console.error(
    "author-request-failed",
    error instanceof Error ? error.name : "UnknownError"
  );
  return NextResponse.json(
    {
      error: "Không thể xử lý dữ liệu. Hãy thử lại hoặc liên hệ quản trị viên.",
    },
    { status: 500 }
  );
}
