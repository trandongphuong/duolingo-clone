import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { stat } from "node:fs/promises";
import path from "node:path";

import { and, asc, eq, inArray, ne, sql } from "drizzle-orm";
import { z } from "zod";

import db from "@/db/drizzle";
import {
  challengeOptions,
  challengeProgress,
  challenges,
  courses,
  exerciseAttempts,
  lessons,
  mediaFiles,
  units,
  vocabularyEntries,
} from "@/db/schema";
import { currentUser } from "@/lib/auth";
import { mediaDiskPath } from "@/lib/media";
import { canReadMedia } from "@/lib/media-access";
import { lockAuthorWriteActor } from "@/lib/write-actor";
import {
  generateExercises,
  vocabularySourceKey,
} from "@/lib/generate-exercises";
import {
  validateVocabularyRows,
  type VocabularyRow,
} from "@/lib/import-vocabulary";

export class ContentError extends Error {
  constructor(
    message: string,
    public status = 400
  ) {
    super(message);
  }
}

export type ContentActor = { id: string; role: string };

export async function requireAuthor(): Promise<ContentActor> {
  const user = await currentUser();
  if (!user) throw new ContentError("Bạn cần đăng nhập.", 401);
  if (user.role !== "author" && user.role !== "admin")
    throw new ContentError("Tài khoản không có quyền biên soạn.", 403);
  return user;
}

export async function getEditableLesson(
  actor: ContentActor,
  id: number,
  editable = false
) {
  if (!Number.isSafeInteger(id) || id < 1)
    throw new ContentError("Mã bài không hợp lệ.");
  const lesson = await db.query.lessons.findFirst({
    where: eq(lessons.id, id),
    with: { unit: { with: { course: true } } },
  });
  if (!lesson) throw new ContentError("Không tìm thấy bài học.", 404);
  if (actor.role !== "admin" && lesson.unit.course.createdBy !== actor.id)
    throw new ContentError("Bạn chỉ được biên soạn khóa của mình.", 403);
  if (editable && lesson.status !== "draft")
    throw new ContentError(
      "Bài không ở trạng thái nháp. Hãy tạo phiên bản nháp mới trước khi sửa.",
      409
    );
  return lesson;
}

export async function listAuthorCourses(actor: ContentActor) {
  return db.query.courses.findMany({
    where: actor.role === "admin" ? undefined : eq(courses.createdBy, actor.id),
    orderBy: [asc(courses.id)],
    with: {
      units: {
        orderBy: [asc(units.order)],
        with: {
          lessons: { orderBy: [asc(lessons.order), asc(lessons.version)] },
        },
      },
    },
  });
}

const createCourseSchema = z
  .object({
    courseId: z.number().int().positive().optional(),
    unitId: z.number().int().positive().optional(),
    courseTitle: z.string().trim().min(1).max(150).optional(),
    slug: z
      .string()
      .trim()
      .min(2)
      .max(80)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .optional(),
    description: z.string().trim().max(2000).default(""),
    unitTitle: z.string().trim().min(1).max(150),
    lessonTitle: z.string().trim().min(1).max(150),
    lessonCode: z
      .string()
      .trim()
      .min(1)
      .max(40)
      .regex(/^[a-zA-Z0-9_-]+$/),
    lessonDescription: z.string().trim().max(2000).default(""),
    order: z.number().int().min(1).max(10000).default(1),
  })
  .strict();

export async function createAuthorLesson(actor: ContentActor, input: unknown) {
  const result = createCourseSchema.safeParse(input);
  if (!result.success)
    throw new ContentError(
      "Tên khóa/chủ đề/bài, mã chữ thường không dấu hoặc thứ tự chưa hợp lệ."
    );
  const data = result.data;
  if (!data.courseId && (!data.courseTitle || !data.slug))
    throw new ContentError("Khóa mới cần tên và mã khóa.");
  return db.transaction(async (tx) => {
    await lockAuthorWriteActor(tx, actor);
    let courseId = data.courseId;
    if (courseId) {
      const course = await tx.query.courses.findFirst({
        where: eq(courses.id, courseId),
      });
      if (!course) throw new ContentError("Không tìm thấy khóa học.", 404);
      if (actor.role !== "admin" && course.createdBy !== actor.id)
        throw new ContentError("Không có quyền biên soạn khóa này.", 403);
    } else {
      const [course] = await tx
        .insert(courses)
        .values({
          title: data.courseTitle!,
          slug: data.slug!,
          description: data.description,
          imageSrc: "/han-ngu-bien.svg",
          status: "draft",
          createdBy: actor.id,
          sampleUnreviewed: true,
        })
        .returning();
      courseId = course.id;
    }
    let unitId = data.unitId;
    if (unitId) {
      const unit = await tx.query.units.findFirst({
        where: and(eq(units.id, unitId), eq(units.courseId, courseId)),
      });
      if (!unit) throw new ContentError("Chủ đề không thuộc khóa đã chọn.");
    } else {
      const [unit] = await tx
        .insert(units)
        .values({
          courseId,
          title: data.unitTitle,
          description: "",
          order: data.order,
        })
        .returning();
      unitId = unit.id;
    }
    // Codes identify an immutable publication family within a unit. A new
    // lesson must not silently replace an existing family at version one.
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(${unitId}, hashtext(${data.lessonCode}))`
    );
    const existingFamily = await tx.query.lessons.findFirst({
      where: and(eq(lessons.unitId, unitId), eq(lessons.code, data.lessonCode)),
    });
    if (existingFamily)
      throw new ContentError(
        "Mã bài đã tồn tại trong chủ đề. Chọn mã khác hoặc tạo phiên bản nháp mới từ bài hiện có.",
        409
      );
    const [lesson] = await tx
      .insert(lessons)
      .values({
        unitId,
        title: data.lessonTitle,
        code: data.lessonCode,
        description: data.lessonDescription,
        order: data.order,
        status: "draft",
      })
      .returning();
    return { courseId, unitId, lessonId: lesson.id };
  });
}

export async function lessonRows(lessonId: number): Promise<VocabularyRow[]> {
  const [lesson] = await db
    .select({ code: lessons.code })
    .from(lessons)
    .where(eq(lessons.id, lessonId));
  const entries = await db
    .select()
    .from(vocabularyEntries)
    .where(eq(vocabularyEntries.lessonId, lessonId))
    .orderBy(asc(vocabularyEntries.order));
  return entries.map((entry) => ({
    lesson_code: lesson?.code || "L01",
    order: entry.order,
    hanzi: entry.hanzi,
    pinyin: entry.pinyin,
    meaning_vi: entry.meaningVi,
    example_zh: entry.exampleZh,
    example_pinyin: entry.examplePinyin,
    example_vi: entry.exampleVi,
    audio_file: entry.audioPath || "",
    tags: entry.tags,
  }));
}

export async function checkMedia(rows: VocabularyRow[], actor: ContentActor) {
  const issues: Array<{ row: number; message: string }> = [];
  for (const [index, row] of rows.entries()) {
    if (!row.audio_file) continue;
    if (/^\/api\/media\/[0-9a-f-]{36}$/i.test(row.audio_file)) {
      const media = await db.query.mediaFiles.findFirst({
        where: eq(mediaFiles.path, row.audio_file),
      });
      let exists = false;
      if (
        media &&
        media.mime.startsWith("audio/") &&
        (await canReadMedia(actor, media))
      ) {
        try {
          exists = (await stat(mediaDiskPath(media.id))).isFile();
        } catch {
          exists = false;
        }
      }
      if (!exists)
        issues.push({
          row: index + 2,
          message:
            "Tệp âm thanh chưa được tải lên, đã thiếu trên ổ đĩa hoặc không phải âm thanh.",
        });
    } else {
      if (!/^\/[a-zA-Z0-9_-]+\.(mp3|wav|ogg)$/.test(row.audio_file)) {
        issues.push({
          row: index + 2,
          message: "Chỉ chấp nhận đường dẫn âm thanh nội bộ hợp lệ.",
        });
        continue;
      }
      try {
        if (
          !(
            await stat(
              path.join(process.cwd(), "public", row.audio_file.slice(1))
            )
          ).isFile()
        )
          throw new Error("missing");
      } catch {
        issues.push({
          row: index + 2,
          message: "Không tìm thấy tệp âm thanh nội bộ.",
        });
      }
    }
  }
  return issues;
}

function previewSecret() {
  const secret = process.env.SESSION_PASSWORD;
  if (!secret || secret.length < 32)
    throw new ContentError("Máy chủ chưa cấu hình khóa phiên đủ mạnh.", 503);
  return secret;
}

function rowsHash(rows: VocabularyRow[]) {
  return createHash("sha256").update(JSON.stringify(rows)).digest("hex");
}

export function signPreview(
  actor: ContentActor,
  lessonId: number,
  rows: VocabularyRow[]
) {
  const payload = Buffer.from(
    JSON.stringify({
      userId: actor.id,
      lessonId,
      hash: rowsHash(rows),
      expires: Date.now() + 15 * 60 * 1000,
    })
  ).toString("base64url");
  return `${payload}.${createHmac("sha256", previewSecret()).update(`han-ngu-bien:import-preview:${payload}`).digest("base64url")}`;
}

function verifyPreview(
  actor: ContentActor,
  lessonId: number,
  rows: VocabularyRow[],
  receipt: string
) {
  const [payload, supplied, extra] = receipt.split(".");
  if (!payload || !supplied || extra)
    throw new ContentError("Hãy xem trước dữ liệu rồi xác nhận lưu.", 409);
  const expected = createHmac("sha256", previewSecret())
    .update(`han-ngu-bien:import-preview:${payload}`)
    .digest();
  const actual = Buffer.from(supplied, "base64url");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
    throw new ContentError("Phiếu xem trước không hợp lệ.", 409);
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (
      data.userId !== actor.id ||
      data.lessonId !== lessonId ||
      data.hash !== rowsHash(rows) ||
      data.expires < Date.now()
    )
      throw new Error("stale");
  } catch {
    throw new ContentError(
      "Dữ liệu đã thay đổi hoặc phiếu xem trước hết hạn. Hãy xem trước lại.",
      409
    );
  }
}

export async function previewRows(
  actor: ContentActor,
  lessonId: number,
  input: unknown[]
) {
  await getEditableLesson(actor, lessonId);
  const result = validateVocabularyRows(input);
  result.issues.push(...(await checkMedia(result.rows, actor)));
  if (new Set(result.rows.map((row) => row.lesson_code)).size > 1)
    result.issues.push({
      row: 1,
      message: "Mỗi lần nhập chỉ dành cho một bài. Hãy tách các lesson_code.",
    });
  const generated = generateExercises(
    result.rows.map((row, i) => ({
      id: i + 1,
      sourceKey: vocabularySourceKey(row.hanzi),
      hanzi: row.hanzi,
      pinyin: row.pinyin,
      meaningVi: row.meaning_vi,
    }))
  );
  return {
    ...result,
    examples: generated.exercises.slice(0, 4),
    generationWarnings: generated.warnings,
    receipt: result.issues.length
      ? null
      : signPreview(actor, lessonId, result.rows),
  };
}

export async function saveRows(actor: ContentActor, input: unknown) {
  const parsed = z
    .object({
      lessonId: z.number().int().positive(),
      rows: z.array(z.unknown()).min(1).max(2000),
      mode: z.enum(["skip", "update"]),
      receipt: z.string().max(2000),
      replace: z.boolean().default(false),
    })
    .strict()
    .safeParse(input);
  if (!parsed.success) throw new ContentError("Yêu cầu lưu không hợp lệ.");
  const data = parsed.data;
  const result = validateVocabularyRows(data.rows);
  result.issues.push(...(await checkMedia(result.rows, actor)));
  if (result.issues.length)
    throw new ContentError(
      result.issues.map((x) => `Dòng ${x.row}: ${x.message}`).join("; ")
    );
  verifyPreview(actor, data.lessonId, result.rows, data.receipt);
  await getEditableLesson(actor, data.lessonId, true);
  return db.transaction(async (tx) => {
    await lockAuthorWriteActor(tx, actor);
    await tx.execute(
      sql`SELECT id FROM lessons WHERE id = ${data.lessonId} FOR UPDATE`
    );
    const locked = await tx.query.lessons.findFirst({
      where: eq(lessons.id, data.lessonId),
    });
    if (!locked || locked.status !== "draft")
      throw new ContentError("Bài không còn ở trạng thái nháp.", 409);
    const history = await tx
      .select({ id: exerciseAttempts.id })
      .from(exerciseAttempts)
      .innerJoin(challenges, eq(challenges.id, exerciseAttempts.challengeId))
      .where(eq(challenges.lessonId, data.lessonId))
      .limit(1);
    const progress = await tx
      .select({ id: challengeProgress.id })
      .from(challengeProgress)
      .innerJoin(challenges, eq(challenges.id, challengeProgress.challengeId))
      .where(eq(challenges.lessonId, data.lessonId))
      .limit(1);
    if (history.length || progress.length)
      throw new ContentError(
        "Bài đã có lịch sử học. Hãy tạo phiên bản mới để giữ lịch sử.",
        409
      );
    let inserted = 0,
      updated = 0,
      skipped = 0;
    const keys: string[] = [];
    for (const row of result.rows) {
      const sourceKey = vocabularySourceKey(row.hanzi);
      keys.push(sourceKey);
      const values = {
        lessonId: data.lessonId,
        sourceKey,
        order: row.order,
        hanzi: row.hanzi,
        pinyin: row.pinyin,
        meaningVi: row.meaning_vi,
        exampleZh: row.example_zh,
        examplePinyin: row.example_pinyin,
        exampleVi: row.example_vi,
        audioPath: row.audio_file || null,
        tags: row.tags,
      };
      const existing = await tx.query.vocabularyEntries.findFirst({
        where: and(
          eq(vocabularyEntries.lessonId, data.lessonId),
          eq(vocabularyEntries.sourceKey, sourceKey)
        ),
      });
      if (existing) {
        if (data.mode === "skip") skipped++;
        else {
          await tx
            .update(vocabularyEntries)
            .set(values)
            .where(eq(vocabularyEntries.id, existing.id));
          updated++;
        }
      } else {
        await tx.insert(vocabularyEntries).values(values);
        inserted++;
      }
    }
    // The editor explicitly requests full-table replacement; ordinary imports append/update.
    if (data.replace && data.mode === "update") {
      const existing = await tx
        .select({
          id: vocabularyEntries.id,
          sourceKey: vocabularyEntries.sourceKey,
        })
        .from(vocabularyEntries)
        .where(eq(vocabularyEntries.lessonId, data.lessonId));
      const stale = existing
        .filter((x) => !keys.includes(x.sourceKey))
        .map((x) => x.id);
      if (stale.length) {
        await tx
          .delete(challenges)
          .where(
            and(
              eq(challenges.lessonId, data.lessonId),
              inArray(challenges.vocabularyId, stale)
            )
          );
        await tx
          .delete(vocabularyEntries)
          .where(inArray(vocabularyEntries.id, stale));
      }
    }
    const entries = await tx
      .select()
      .from(vocabularyEntries)
      .where(eq(vocabularyEntries.lessonId, data.lessonId))
      .orderBy(asc(vocabularyEntries.order));
    const generated = generateExercises(entries);
    const existingChallenges = await tx
      .select()
      .from(challenges)
      .where(eq(challenges.lessonId, data.lessonId));
    const generatedKeys = new Set(generated.exercises.map((x) => x.sourceKey));
    for (const previous of existingChallenges) {
      if (!previous.sourceKey || !generatedKeys.has(previous.sourceKey))
        await tx.delete(challenges).where(eq(challenges.id, previous.id));
    }
    for (const exercise of generated.exercises) {
      const previous = existingChallenges.find(
        (x) => x.sourceKey === exercise.sourceKey
      );
      let challengeId: number;
      const values = {
        lessonId: data.lessonId,
        sourceKey: exercise.sourceKey,
        type: exercise.type,
        question: exercise.question,
        vocabularyId: exercise.vocabularyId,
        order: exercise.order,
      };
      if (previous) {
        challengeId = previous.id;
        await tx
          .update(challenges)
          .set(values)
          .where(eq(challenges.id, challengeId));
        await tx
          .delete(challengeOptions)
          .where(eq(challengeOptions.challengeId, challengeId));
      } else {
        const [created] = await tx
          .insert(challenges)
          .values(values)
          .returning();
        challengeId = created.id;
      }
      await tx
        .insert(challengeOptions)
        .values(exercise.options.map((option) => ({ challengeId, ...option })));
    }
    return {
      inserted,
      updated,
      skipped,
      total: entries.length,
      questions: generated.exercises.length,
      warnings: generated.warnings,
    };
  });
}

export async function transitionLesson(actor: ContentActor, input: unknown) {
  const parsed = z
    .object({
      lessonId: z.number().int().positive(),
      action: z.enum(["submit", "return", "publish", "clone"]),
    })
    .strict()
    .safeParse(input);
  if (!parsed.success)
    throw new ContentError("Thao tác trạng thái không hợp lệ.");
  const { lessonId, action } = parsed.data;
  const lesson = await getEditableLesson(actor, lessonId);
  if (action === "publish" && actor.role !== "admin")
    throw new ContentError("Chỉ quản trị viên được xuất bản.", 403);
  return db.transaction(async (tx) => {
    await lockAuthorWriteActor(tx, actor);
    // Serialize one publication family before taking row locks to avoid clone/publish deadlocks.
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(${lesson.unitId}, hashtext(${lesson.code}))`
    );
    await tx.execute(
      sql`SELECT id FROM lessons WHERE id = ${lessonId} FOR UPDATE`
    );
    const locked = await tx.query.lessons.findFirst({
      where: eq(lessons.id, lessonId),
    });
    if (!locked) throw new ContentError("Không tìm thấy bài.", 404);
    if (action === "clone") {
      if (locked.status !== "published" && locked.status !== "archived")
        throw new ContentError(
          "Chỉ tạo phiên bản mới từ bài đã xuất bản.",
          409
        );
      const family = await tx
        .select()
        .from(lessons)
        .where(
          and(eq(lessons.unitId, locked.unitId), eq(lessons.code, locked.code))
        );
      const existingDraft = family.find(
        (item) => item.status === "draft" || item.status === "review"
      );
      if (existingDraft)
        return { lessonId: existingDraft.id, status: existingDraft.status };
      const version = Math.max(...family.map((item) => item.version)) + 1;
      const [created] = await tx
        .insert(lessons)
        .values({
          unitId: locked.unitId,
          title: locked.title,
          code: locked.code,
          description: locked.description,
          order: locked.order,
          status: "draft",
          version,
          previousVersionId: locked.id,
        })
        .returning();
      const previousEntries = await tx
        .select()
        .from(vocabularyEntries)
        .where(eq(vocabularyEntries.lessonId, lessonId));
      if (previousEntries.length)
        await tx.insert(vocabularyEntries).values(
          previousEntries.map((entry) => ({
            lessonId: created.id,
            sourceKey: entry.sourceKey,
            order: entry.order,
            hanzi: entry.hanzi,
            pinyin: entry.pinyin,
            meaningVi: entry.meaningVi,
            exampleZh: entry.exampleZh,
            examplePinyin: entry.examplePinyin,
            exampleVi: entry.exampleVi,
            audioPath: entry.audioPath,
            tags: entry.tags,
            sourceNote: entry.sourceNote,
          }))
        );
      return { lessonId: created.id, status: created.status };
    }
    if (action === "return") {
      if (locked.status !== "review")
        throw new ContentError("Bài chưa gửi duyệt.", 409);
      if (actor.role !== "admin")
        throw new ContentError("Chỉ quản trị viên được trả bài về nháp.", 403);
      await tx
        .update(lessons)
        .set({ status: "draft" })
        .where(eq(lessons.id, lessonId));
      return { lessonId, status: "draft" };
    }
    if (action === "submit" && locked.status !== "draft")
      throw new ContentError("Chỉ bản nháp mới gửi duyệt được.", 409);
    if (
      action === "publish" &&
      locked.status !== "review" &&
      locked.status !== "draft"
    )
      throw new ContentError("Bài không sẵn sàng xuất bản.", 409);
    const entries = await tx
      .select()
      .from(vocabularyEntries)
      .where(eq(vocabularyEntries.lessonId, lessonId))
      .orderBy(asc(vocabularyEntries.order));
    const generated = generateExercises(entries);
    if (entries.length < 2 || generated.exercises.length !== entries.length * 2)
      throw new ContentError(
        "Cần ít nhất hai mục phân biệt để tạo đủ câu chọn nghĩa và chọn chữ trước khi gửi duyệt/xuất bản."
      );
    const mediaIssues = await checkMedia(
      entries.map((e) => ({
        lesson_code: locked.code,
        order: e.order,
        hanzi: e.hanzi,
        pinyin: e.pinyin,
        meaning_vi: e.meaningVi,
        example_zh: e.exampleZh,
        example_pinyin: e.examplePinyin,
        example_vi: e.exampleVi,
        audio_file: e.audioPath || "",
        tags: e.tags,
      })),
      actor
    );
    if (mediaIssues.length)
      throw new ContentError(mediaIssues.map((x) => x.message).join("; "));
    // Published questions are regenerated from vocabulary, never trusted from an advanced edit.
    const history = await tx
      .select({ id: exerciseAttempts.id })
      .from(exerciseAttempts)
      .innerJoin(challenges, eq(challenges.id, exerciseAttempts.challengeId))
      .where(eq(challenges.lessonId, lessonId))
      .limit(1);
    const progress = await tx
      .select({ id: challengeProgress.id })
      .from(challengeProgress)
      .innerJoin(challenges, eq(challenges.id, challengeProgress.challengeId))
      .where(eq(challenges.lessonId, lessonId))
      .limit(1);
    if (history.length || progress.length)
      throw new ContentError(
        "Bài đã có lịch sử học. Hãy tạo phiên bản mới.",
        409
      );
    const existing = await tx
      .select()
      .from(challenges)
      .where(eq(challenges.lessonId, lessonId));
    const generatedKeys = new Set(
      generated.exercises.map((item) => item.sourceKey)
    );
    for (const previous of existing)
      if (!previous.sourceKey || !generatedKeys.has(previous.sourceKey))
        await tx.delete(challenges).where(eq(challenges.id, previous.id));
    for (const exercise of generated.exercises) {
      const previous = existing.find(
        (item) => item.sourceKey === exercise.sourceKey
      );
      const values = {
        lessonId,
        sourceKey: exercise.sourceKey,
        type: exercise.type,
        question: exercise.question,
        vocabularyId: exercise.vocabularyId,
        order: exercise.order,
      };
      let challengeId: number;
      if (previous) {
        challengeId = previous.id;
        await tx
          .update(challenges)
          .set(values)
          .where(eq(challenges.id, challengeId));
        await tx
          .delete(challengeOptions)
          .where(eq(challengeOptions.challengeId, challengeId));
      } else {
        const [created] = await tx
          .insert(challenges)
          .values(values)
          .returning();
        challengeId = created.id;
      }
      await tx
        .insert(challengeOptions)
        .values(exercise.options.map((option) => ({ challengeId, ...option })));
    }
    const status = action === "publish" ? "published" : "review";
    await tx.update(lessons).set({ status }).where(eq(lessons.id, lessonId));
    if (action === "publish") {
      await tx
        .update(courses)
        .set({ status: "published" })
        .where(eq(courses.id, lesson.unit.courseId));
      await tx
        .update(lessons)
        .set({ status: "archived" })
        .where(
          and(
            eq(lessons.unitId, locked.unitId),
            eq(lessons.code, locked.code),
            eq(lessons.status, "published"),
            ne(lessons.id, lessonId)
          )
        );
    }
    return { lessonId, status, warnings: generated.warnings };
  });
}
