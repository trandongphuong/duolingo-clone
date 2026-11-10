import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { sampleLessons } from "../data/sample-course";
import { generateExercises } from "../lib/generate-exercises";
import {
  MAX_MEDIA_BYTES,
  mediaDiskPath,
  parseByteRange,
  readMediaForm,
  UploadTooLargeError,
  validateMedia,
} from "../lib/media";

const wav = readFileSync(new URL("../data/test-tone.wav", import.meta.url));

test("WAV demo nguyên bản có định dạng hợp lệ, không phải lời nói", () => {
  assert.equal(validateMedia(wav, "audio/wav"), "audio/wav");
  assert.equal(validateMedia(wav, "audio/x-wav"), "audio/wav");
});

test("Từ chối MIME giả, tệp thực thi/SVG và nội dung rỗng", () => {
  assert.throws(() => validateMedia(wav, "image/png"));
  assert.throws(() =>
    validateMedia(Buffer.from("<svg onload=alert(1)></svg>"), "image/svg+xml")
  );
  assert.throws(() =>
    validateMedia(Buffer.from("MZ executable"), "audio/mpeg")
  );
  assert.throws(() => validateMedia(Buffer.alloc(0), "audio/wav"));
  assert.throws(() =>
    validateMedia(Buffer.alloc(MAX_MEDIA_BYTES + 1), "audio/wav")
  );
});

test("WAV khai báo chunk/độ dài sai bị từ chối", () => {
  const malformed = Buffer.from(wav);
  malformed.writeUInt32LE(0xffffffff, 40);
  assert.throws(() => validateMedia(malformed, "audio/wav"));
  const truncated = wav.subarray(0, 30);
  assert.throws(() => validateMedia(truncated, "audio/wav"));
});

test("PNG nội bộ hợp lệ có thể tải lên", () => {
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+sVh8AAAAASUVORK5CYII=",
    "base64"
  );
  assert.equal(validateMedia(png, "image/png"), "image/png");
});

test("ID media không cho phép traversal hoặc tên tệp do client chọn", () => {
  assert.throws(() => mediaDiskPath("../../etc/passwd"));
  assert.throws(() => mediaDiskPath("//example.com/evil"));
  assert.throws(() => mediaDiskPath("bad-id.wav"));
  assert.match(
    mediaDiskPath("724b0d71-728d-4a4d-ae57-acd47de794ab"),
    /724b0d71-728d-4a4d-ae57-acd47de794ab$/
  );
});

test("Hỗ trợ byte-range audio và từ chối range hỏng", () => {
  assert.equal(parseByteRange(null, 100), null);
  assert.deepEqual(parseByteRange("bytes=0-9", 100), { start: 0, end: 9 });
  assert.deepEqual(parseByteRange("bytes=95-", 100), { start: 95, end: 99 });
  assert.deepEqual(parseByteRange("bytes=-10", 100), { start: 90, end: 99 });
  assert.deepEqual(parseByteRange("bytes=90-999", 100), { start: 90, end: 99 });
  for (const value of [
    "bytes=200-",
    "bytes=9-2",
    "bytes=0-1,4-5",
    "bytes=-0",
    "bytes=-",
    "items=0-1",
  ]) {
    assert.throws(() => parseByteRange(value, 100));
  }
});

test("Bộ mẫu có 10 bài, 100 mục Hanzi/Pinyin/nghĩa Việt không trùng trong bài", () => {
  assert.equal(sampleLessons.length, 10);
  assert.equal(
    sampleLessons.reduce((sum, lesson) => sum + lesson.entries.length, 0),
    100
  );
  for (const lesson of sampleLessons) {
    assert.equal(lesson.entries.length, 10);
    assert.equal(new Set(lesson.entries.map((entry) => entry[0])).size, 10);
    for (const [hanzi, pinyin, meaning] of lesson.entries) {
      assert.match(hanzi, /\p{Script=Han}/u);
      assert.ok(pinyin.trim());
      assert.ok(meaning.trim());
    }
    const generated = generateExercises(
      lesson.entries.map(([hanzi, pinyin, meaningVi], index) => ({
        id: index + 1,
        sourceKey: `${lesson.code}:${index}`,
        hanzi,
        pinyin,
        meaningVi,
      }))
    );
    assert.equal(generated.exercises.length, 20);
    assert.equal(generated.warnings.length, 0);
    for (const exercise of generated.exercises) {
      assert.equal(
        exercise.options.filter((option) => option.correct).length,
        1
      );
      assert.equal(
        new Set(exercise.options.map((option) => option.text)).size,
        exercise.options.length
      );
    }
  }
});

test("Multipart được giới hạn khi stream, kể cả không có Content-Length", async () => {
  const form = new FormData();
  form.set(
    "file",
    new File([new Uint8Array(wav)], "tone.wav", { type: "audio/wav" })
  );
  const request = new Request("http://localhost/api/media", {
    method: "POST",
    body: form,
  });
  const parsed = await readMediaForm(request);
  assert.equal((parsed.get("file") as File).size, wav.length);
  const oversized = new Request("http://localhost/api/media", {
    method: "POST",
    headers: { "Content-Type": "multipart/form-data; boundary=test" },
    body: new Uint8Array(MAX_MEDIA_BYTES + 65537),
  });
  await assert.rejects(readMediaForm(oversized), UploadTooLargeError);
});
