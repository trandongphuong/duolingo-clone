import path from "node:path";

export const MAX_MEDIA_BYTES = 5 * 1024 * 1024;
export const MEDIA_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const MEDIA_TYPES = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "audio/ogg": "ogg",
} as const;

export type MediaMime = keyof typeof MEDIA_TYPES;

export function mediaDirectory() {
  return path.resolve(/*turbopackIgnore: true*/ process.env.MEDIA_DIR || "work/media");
}

export function mediaDiskPath(id: string) {
  if (!MEDIA_ID_PATTERN.test(id)) throw new Error("Mã tệp không hợp lệ.");
  return path.join(/*turbopackIgnore: true*/ mediaDirectory(), id);
}

export function mediaLimitBytes() {
  const configured = Number(process.env.MAX_MEDIA_BYTES || MAX_MEDIA_BYTES);
  return Number.isSafeInteger(configured) && configured > 0
    ? Math.min(configured, MAX_MEDIA_BYTES)
    : MAX_MEDIA_BYTES;
}

function starts(data: Buffer, signature: readonly number[]) {
  return signature.every((byte, index) => data[index] === byte);
}

function isMpegFrame(data: Buffer, offset: number) {
  if (offset + 4 >= data.length || data[offset] !== 0xff) return false;
  const b1 = data[offset + 1];
  const b2 = data[offset + 2];
  return (
    (b1 & 0xe0) === 0xe0 &&
    (b1 & 0x18) !== 0x08 &&
    (b1 & 0x06) !== 0 &&
    (b2 & 0xf0) !== 0xf0 &&
    (b2 & 0xf0) !== 0 &&
    (b2 & 0x0c) !== 0x0c
  );
}

function validWav(data: Buffer) {
  if (
    data.length < 44 ||
    data.toString("ascii", 0, 4) !== "RIFF" ||
    data.toString("ascii", 8, 12) !== "WAVE" ||
    data.readUInt32LE(4) + 8 !== data.length
  )
    return false;
  let format = false;
  let samples = false;
  let offset = 12;
  while (offset + 8 <= data.length) {
    const chunk = data.toString("ascii", offset, offset + 4);
    const size = data.readUInt32LE(offset + 4);
    if (offset + 8 + size > data.length) return false;
    if (chunk === "fmt " && size >= 16) {
      const encoding = data.readUInt16LE(offset + 8);
      const channels = data.readUInt16LE(offset + 10);
      const sampleRate = data.readUInt32LE(offset + 12);
      format =
        [1, 3].includes(encoding) &&
        channels >= 1 &&
        channels <= 8 &&
        sampleRate >= 8000 &&
        sampleRate <= 192000;
    }
    if (chunk === "data" && size > 0) samples = true;
    offset += 8 + size + (size % 2);
  }
  return format && samples;
}

/** Checks declared MIME against a supported binary signature; filenames are never trusted. */
export function validateMedia(data: Buffer, declaredType: string): MediaMime {
  if (data.length === 0 || data.length > mediaLimitBytes()) {
    throw new Error("Tệp phải có dữ liệu và không vượt quá 5 MB.");
  }
  const mime = declaredType.toLowerCase().split(";")[0].trim();
  const normalized =
    mime === "audio/x-wav" || mime === "audio/wave" ? "audio/wav" : mime;
  if (!(normalized in MEDIA_TYPES)) {
    throw new Error("Chỉ chấp nhận PNG, JPEG, WebP, MP3, WAV hoặc OGG.");
  }
  let matches = false;
  if (normalized === "image/png") {
    matches =
      data.length > 32 &&
      starts(data, [137, 80, 78, 71, 13, 10, 26, 10]) &&
      data.readUInt32BE(8) === 13 &&
      data.toString("ascii", 12, 16) === "IHDR" &&
      data.readUInt32BE(16) > 0 &&
      data.readUInt32BE(20) > 0 &&
      data.readUInt32BE(16) * data.readUInt32BE(20) <= 32_000_000 &&
      data.toString("ascii", data.length - 8, data.length - 4) === "IEND";
  } else if (normalized === "image/jpeg") {
    matches =
      data.length > 16 &&
      starts(data, [255, 216, 255]) &&
      data[data.length - 2] === 255 &&
      data[data.length - 1] === 217;
  } else if (normalized === "image/webp") {
    matches =
      data.length > 20 &&
      data.toString("ascii", 0, 4) === "RIFF" &&
      data.readUInt32LE(4) + 8 === data.length &&
      data.toString("ascii", 8, 12) === "WEBP" &&
      ["VP8 ", "VP8L", "VP8X"].includes(data.toString("ascii", 12, 16));
  } else if (normalized === "audio/wav") {
    matches = validWav(data);
  } else if (normalized === "audio/ogg") {
    const hasCodec =
      data.subarray(0, 512).includes(Buffer.from("vorbis")) ||
      data.subarray(0, 512).includes(Buffer.from("OpusHead"));
    matches =
      data.length > 35 &&
      data.toString("ascii", 0, 4) === "OggS" &&
      data[4] === 0 &&
      hasCodec;
  } else if (normalized === "audio/mpeg") {
    let offset = 0;
    if (data.length > 10 && data.toString("ascii", 0, 3) === "ID3") {
      if (data.subarray(6, 10).some((byte) => byte > 127))
        throw new Error("Header MP3 không hợp lệ.");
      offset =
        10 + ((data[6] << 21) | (data[7] << 14) | (data[8] << 7) | data[9]);
      if (data[5] & 0x10) offset += 10;
    }
    matches = isMpegFrame(data, offset);
  }
  if (!matches)
    throw new Error("Nội dung tệp không khớp định dạng đã khai báo.");
  return normalized as MediaMime;
}

export function parseByteRange(value: string | null, size: number) {
  if (!value) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(value);
  if (!match || (!match[1] && !match[2])) throw new Error("range");
  let start = match[1]
    ? Number(match[1])
    : Math.max(0, size - Number(match[2]));
  const end =
    match[1] && match[2] ? Math.min(size - 1, Number(match[2])) : size - 1;
  start = Math.max(0, start);
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start >= size ||
    start > end
  )
    throw new Error("range");
  return { start, end };
}

export class UploadTooLargeError extends Error {
  constructor() {
    super("Tệp vượt quá giới hạn 5 MB.");
  }
}

/** Bound the streamed multipart body before the platform parser allocates it. */
export async function readMediaForm(request: Request) {
  const limit = mediaLimitBytes() + 64 * 1024;
  const reader = request.body?.getReader();
  if (!reader) throw new Error("Chưa chọn tệp.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new UploadTooLargeError();
      }
      chunks.push(chunk.value);
    }
  } finally {
    reader.releaseLock();
  }
  return new Response(new Uint8Array(Buffer.concat(chunks)), {
    headers: { "Content-Type": request.headers.get("content-type") || "" },
  }).formData();
}
