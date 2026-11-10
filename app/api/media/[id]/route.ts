import { readFile } from "node:fs/promises";

import { eq } from "drizzle-orm";

import db from "@/db/drizzle";
import { mediaFiles } from "@/db/schema";
import { currentUser } from "@/lib/auth";
import { canReadMedia } from "@/lib/media-access";
import {
  MEDIA_ID_PATTERN,
  MEDIA_TYPES,
  mediaDiskPath,
  parseByteRange,
} from "@/lib/media";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await currentUser();
  if (!user) return new Response("Bạn cần đăng nhập.", { status: 401 });
  const { id } = await params;
  if (!MEDIA_ID_PATTERN.test(id))
    return new Response("Không tìm thấy tệp.", { status: 404 });
  const record = await db.query.mediaFiles.findFirst({
    where: eq(mediaFiles.id, id),
  });
  if (
    !record ||
    !(record.mime in MEDIA_TYPES) ||
    !(await canReadMedia(user, record))
  )
    return new Response("Không tìm thấy tệp.", { status: 404 });
  let data: Buffer;
  try {
    data = await readFile(mediaDiskPath(id));
  } catch {
    return new Response("Không tìm thấy tệp trên bộ lưu trữ.", { status: 404 });
  }
  const extension = MEDIA_TYPES[record.mime as keyof typeof MEDIA_TYPES];
  const headers = new Headers({
    "Content-Type": record.mime,
    "Content-Length": String(data.length),
    "Content-Disposition": `inline; filename="${id}.${extension}"`,
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "private, no-store",
    Vary: "Cookie",
    "Accept-Ranges": "bytes",
  });
  try {
    const range = parseByteRange(request.headers.get("range"), data.length);
    if (range) {
      headers.set(
        "Content-Range",
        `bytes ${range.start}-${range.end}/${data.length}`
      );
      headers.set("Content-Length", String(range.end - range.start + 1));
      return new Response(
        new Uint8Array(data.subarray(range.start, range.end + 1)),
        { status: 206, headers }
      );
    }
    return new Response(new Uint8Array(data), { headers });
  } catch {
    return new Response(null, {
      status: 416,
      headers: { "Content-Range": `bytes */${data.length}` },
    });
  }
}
