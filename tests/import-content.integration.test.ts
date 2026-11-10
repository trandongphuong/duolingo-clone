import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const testUrl = process.env.TEST_DATABASE_URL;

test(
  "transactional import, repeat protection, RBAC and immutable publication versions",
  { skip: !testUrl },
  async () => {
    assert.match(
      new URL(testUrl!).pathname,
      /test|e2e/,
      "Use a disposable test database only"
    );
    process.env.DATABASE_URL = testUrl;
    process.env.SESSION_PASSWORD ||= randomUUID() + randomUUID();
    const { default: db, pool } = await import("../db/drizzle");
    const schema = await import("../db/schema");
    const { eq, inArray } = await import("drizzle-orm");
    const {
      createAuthorLesson,
      getEditableLesson,
      previewRows,
      saveRows,
      transitionLesson,
    } = await import("../lib/content");
    const author = { id: randomUUID(), role: "author" };
    const admin = { id: randomUUID(), role: "admin" };
    const learnerId = randomUUID();
    const prefix = `content-test-${randomUUID()}`;
    let courseId = 0;
    const lessonIds: number[] = [];
    try {
      const created = await createAuthorLesson(author, {
        courseTitle: "Khóa kiểm thử",
        slug: prefix,
        unitTitle: "Chào hỏi",
        lessonTitle: "Bài bảng 10 từ",
        lessonCode: "L01",
        order: 1,
      });
      courseId = created.courseId;
      lessonIds.push(created.lessonId);
      await assert.rejects(
        createAuthorLesson(author, {
          courseId: created.courseId,
          unitId: created.unitId,
          unitTitle: "Chào hỏi",
          lessonTitle: "Duplicate code must not replace existing lesson",
          lessonCode: "L01",
          order: 2,
        }),
        /Mã bài đã tồn tại/
      );
      const concurrent = await Promise.allSettled(
        [1, 2, 3].map(() =>
          createAuthorLesson(author, {
            courseId: created.courseId,
            unitId: created.unitId,
            unitTitle: "Chào hỏi",
            lessonTitle: "Concurrent new family",
            lessonCode: "CONCURRENT",
            order: 2,
          })
        )
      );
      assert.equal(
        concurrent.filter((result) => result.status === "fulfilled").length,
        1,
        "Concurrent creates with the same code must create one family only"
      );
      for (const result of concurrent) {
        if (result.status === "fulfilled")
          lessonIds.push(result.value.lessonId);
        else assert.match(String(result.reason), /Mã bài đã tồn tại/);
      }
      const rows = [
        ["你好", "nǐ hǎo", "Xin chào"],
        ["谢谢", "xièxie", "Cảm ơn"],
        ["再见", "zàijiàn", "Tạm biệt"],
        ["海", "hǎi", "Biển"],
        ["船", "chuán", "Thuyền"],
        ["朋友", "péngyou", "Bạn bè"],
        ["天气", "tiānqì", "Thời tiết"],
        ["安全", "ānquán", "An toàn"],
        ["水", "shuǐ", "Nước"],
        ["风", "fēng", "Gió"],
      ].map(([hanzi, pinyin, meaning_vi], i) => ({
        lesson_code: "L01",
        order: i + 1,
        hanzi,
        pinyin,
        meaning_vi,
        example_zh: "",
        example_pinyin: "",
        example_vi: "",
        audio_file: "",
        tags: "test",
      }));
      const firstPreview = await previewRows(author, created.lessonId, rows);
      assert.equal(firstPreview.issues.length, 0);
      assert.ok(firstPreview.receipt);
      const first = await saveRows(author, {
        lessonId: created.lessonId,
        rows: firstPreview.rows,
        receipt: firstPreview.receipt,
        mode: "update",
        replace: true,
      });
      assert.equal(first.total, 10);
      assert.equal(first.questions, 20);
      const initialQuestions = await db
        .select()
        .from(schema.challenges)
        .where(eq(schema.challenges.lessonId, created.lessonId));
      assert.equal(initialQuestions.length, 20);
      const questionIds = initialQuestions
        .map((item) => item.id)
        .sort((a, b) => a - b);
      const countOptions = async () =>
        (
          await db
            .select()
            .from(schema.challengeOptions)
            .where(inArray(schema.challengeOptions.challengeId, questionIds))
        ).length;
      assert.equal(await countOptions(), 80);
      await saveRows(author, {
        lessonId: created.lessonId,
        rows: firstPreview.rows,
        receipt: firstPreview.receipt,
        mode: "update",
        replace: true,
      });
      const repeated = await saveRows(author, {
        lessonId: created.lessonId,
        rows: firstPreview.rows,
        receipt: firstPreview.receipt,
        mode: "skip",
      });
      assert.equal(repeated.skipped, 10);
      assert.equal(repeated.inserted, 0);
      assert.equal(
        (
          await db
            .select()
            .from(schema.vocabularyEntries)
            .where(eq(schema.vocabularyEntries.lessonId, created.lessonId))
        ).length,
        10
      );
      assert.deepEqual(
        (
          await db
            .select({ id: schema.challenges.id })
            .from(schema.challenges)
            .where(eq(schema.challenges.lessonId, created.lessonId))
        )
          .map((item) => item.id)
          .sort((a, b) => a - b),
        questionIds
      );
      assert.equal(await countOptions(), 80);
      await assert.rejects(
        saveRows(author, {
          lessonId: created.lessonId,
          rows: [{ ...rows[0], meaning_vi: "Sửa trái phép" }, ...rows.slice(1)],
          receipt: firstPreview.receipt,
          mode: "update",
        }),
        /xem trước/i
      );
      await assert.rejects(
        getEditableLesson(
          { id: randomUUID(), role: "author" },
          created.lessonId
        ),
        /chỉ được/
      );
      await assert.rejects(
        transitionLesson(author, {
          lessonId: created.lessonId,
          action: "publish",
        }),
        /Chỉ quản trị viên/
      );
      const missing = await previewRows(author, created.lessonId, [
        { ...rows[0], audio_file: `/api/media/${randomUUID()}` },
        ...rows.slice(1),
      ]);
      assert.ok(missing.issues.some((issue) => /âm thanh/.test(issue.message)));
      assert.equal(missing.receipt, null);

      // An advanced draft edit cannot change the answer key used at publication.
      await db
        .update(schema.challenges)
        .set({ question: "WRONG" })
        .where(eq(schema.challenges.id, questionIds[0]));
      await db
        .update(schema.challengeOptions)
        .set({ correct: false })
        .where(eq(schema.challengeOptions.challengeId, questionIds[0]));
      await transitionLesson(author, {
        lessonId: created.lessonId,
        action: "submit",
      });
      await assert.rejects(
        saveRows(author, {
          lessonId: created.lessonId,
          rows: firstPreview.rows,
          receipt: firstPreview.receipt,
          mode: "update",
        }),
        /nháp/
      );
      await transitionLesson(admin, {
        lessonId: created.lessonId,
        action: "publish",
      });
      const repaired = await db.query.challenges.findFirst({
        where: eq(schema.challenges.id, questionIds[0]),
        with: { challengeOptions: true },
      });
      assert.notEqual(repaired?.question, "WRONG");
      assert.equal(
        repaired?.challengeOptions.filter((item) => item.correct).length,
        1
      );
      const correct = repaired!.challengeOptions.find((item) => item.correct)!;
      await db.insert(schema.exerciseAttempts).values({
        userId: learnerId,
        challengeId: repaired!.id,
        optionId: correct.id,
        isCorrect: true,
      });
      await db.insert(schema.challengeProgress).values({
        userId: learnerId,
        challengeId: repaired!.id,
        completed: true,
      });
      await db
        .insert(schema.userProgress)
        .values({ userId: learnerId, activeCourseId: courseId, points: 10 });
      const drafts = await Promise.all(
        Array.from({ length: 4 }, () =>
          transitionLesson(author, {
            lessonId: created.lessonId,
            action: "clone",
          })
        )
      );
      assert.equal(
        new Set(drafts.map((item) => item.lessonId)).size,
        1,
        "concurrent clone opens one draft version"
      );
      const draftId = drafts[0].lessonId;
      lessonIds.push(draftId);
      const draft = await getEditableLesson(author, draftId, true);
      assert.equal(draft.version, 2);
      const editedRows = rows.map((row, i) =>
        i === 0 ? { ...row, meaning_vi: "Xin chào bạn" } : row
      );
      const newPreview = await previewRows(author, draftId, editedRows);
      await saveRows(author, {
        lessonId: draftId,
        rows: newPreview.rows,
        receipt: newPreview.receipt,
        mode: "update",
        replace: true,
      });
      await transitionLesson(admin, { lessonId: draftId, action: "publish" });
      assert.equal(
        (await getEditableLesson(author, created.lessonId)).status,
        "archived"
      );
      assert.equal(
        (await getEditableLesson(author, draftId)).status,
        "published"
      );
      assert.equal(
        (
          await db
            .select()
            .from(schema.exerciseAttempts)
            .where(eq(schema.exerciseAttempts.userId, learnerId))
        ).length,
        1
      );
      assert.equal(
        (
          await db
            .select()
            .from(schema.challengeProgress)
            .where(eq(schema.challengeProgress.userId, learnerId))
        ).length,
        1
      );
      assert.equal(
        (
          await db.query.userProgress.findFirst({
            where: eq(schema.userProgress.userId, learnerId),
          })
        )?.points,
        10
      );
      assert.equal(
        (
          await db.query.challenges.findFirst({
            where: eq(schema.challenges.id, repaired!.id),
          })
        )?.question,
        repaired!.question
      );
      const third = await transitionLesson(author, {
        lessonId: created.lessonId,
        action: "clone",
      });
      lessonIds.push(third.lessonId);
      assert.equal(
        (await getEditableLesson(author, third.lessonId)).version,
        3,
        "clone from archive still gets next family version"
      );
      await transitionLesson(admin, {
        lessonId: third.lessonId,
        action: "publish",
      });
      assert.equal(
        (await getEditableLesson(author, draftId)).status,
        "archived",
        "publishing any new family version archives the prior active sibling"
      );
      assert.equal(
        (await getEditableLesson(author, third.lessonId)).status,
        "published"
      );
    } finally {
      await db
        .delete(schema.exerciseAttempts)
        .where(eq(schema.exerciseAttempts.userId, learnerId));
      await db
        .delete(schema.challengeProgress)
        .where(eq(schema.challengeProgress.userId, learnerId));
      await db
        .delete(schema.userProgress)
        .where(eq(schema.userProgress.userId, learnerId));
      if (lessonIds.length) {
        await db
          .delete(schema.challenges)
          .where(inArray(schema.challenges.lessonId, lessonIds));
        await db
          .delete(schema.vocabularyEntries)
          .where(inArray(schema.vocabularyEntries.lessonId, lessonIds));
      }
      if (courseId)
        await db.delete(schema.courses).where(eq(schema.courses.id, courseId));
      await pool.end();
    }
  }
);
