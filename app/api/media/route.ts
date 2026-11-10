import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";

import db from "@/db/drizzle";
import { mediaFiles } from "@/db/schema";
import { currentUser } from "@/lib/auth";
import {
  mediaDirectory,
  mediaDiskPath,
  mediaLimitBytes,
  readMediaForm,
  UploadTooLargeError,
  validateMedia,
} from "@/lib/media";
import { assertSameOrigin } from "@/lib/security";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user)
    return Response.json({ error: "Bạn cần đăng nhập." }, { status: 401 });
  if (user.role !== "admin" && user.role !== "author") {
    return Response.json(
      { error: "Bạn không có quyền tải tệp." },
      { status: 403 }
    );
  }
  try {
    assertSameOrigin(request);
  } catch {
    return Response.json(
      { error: "Nguồn yêu cầu không hợp lệ." },
      { status: 403 }
    );
  }
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > mediaLimitBytes() + 64 * 1024) {
    return Response.json(
      { error: "Tệp vượt quá giới hạn 5 MB." },
      { status: 413 }
    );
  }
  let id: string | null = null;
  try {
    const form = await readMediaForm(request);
    const file = form.get("file");
    if (!(file instanceof File))
      return Response.json({ error: "Chưa chọn tệp." }, { status: 400 });
    if (file.size > mediaLimitBytes())
      return Response.json(
        { error: "Tệp vượt quá giới hạn 5 MB." },
        { status: 413 }
      );
    const data = Buffer.from(await file.arrayBuffer());
    const mime = validateMedia(data, file.type);
    id = randomUUID();
    await mkdir(mediaDirectory(), { recursive: true, mode: 0o750 });
    await writeFile(mediaDiskPath(id), data, { flag: "wx", mode: 0o640 });
    const record = {
      id,
      path: `/api/media/${id}`,
      mime,
      size: data.length,
      createdBy: user.id,
    };
    await db.insert(mediaFiles).values(record);
    return Response.json(
      { id, path: record.path, mime, size: data.length },
      { status: 201 }
    );
  } catch (error) {
    if (id) await unlink(mediaDiskPath(id)).catch(() => undefined);
    if (error instanceof UploadTooLargeError)
      return Response.json({ error: error.message }, { status: 413 });
    if (
      error instanceof Error &&
      /tệp|MP3|PNG|JPEG|WebP|OGG|WAV/.test(error.message)
    ) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    return Response.json(
      { error: "Không thể lưu tệp. Vui lòng thử lại." },
      { status: 400 }
    );
  }
}
