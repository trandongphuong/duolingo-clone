import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";

import { Pool } from "pg";

const testUrl = process.env.TEST_DATABASE_URL;

test(
  "in-flight content writes reject locked or demoted actors without changing published history",
  {
    skip: !testUrl,
    timeout: 120_000,
  },
  async () => {
    assert.match(
      new URL(testUrl!).pathname,
      /test|e2e/,
      "Only use a disposable test database."
    );
    process.env.DATABASE_URL = testUrl;
    process.env.SESSION_PASSWORD ||= randomUUID() + randomUUID();
    const { default: db, pool: appPool } = await import("../db/drizzle");
    const schema = await import("../db/schema");
    const { localUsers } = await import("../db/auth-schema");
    const { DUMMY_PASSWORD_HASH } = await import("../lib/password");
    const { createAuthorLesson, previewRows, saveRows, transitionLesson } =
      await import("../lib/content");
    const { eq, inArray } = await import("drizzle-orm");
    const observer = new Pool({ connectionString: testUrl, max: 2 });
    const author = { id: randomUUID(), role: "author" as const };
    const admin = { id: randomUUID(), role: "admin" as const };
    const learnerId = randomUUID();
    const actors = [author, admin];
    const prefix = `write-actor-${randomUUID()}`;
    const rows = [
      ["你好", "nǐ hǎo", "Xin chào"],
      ["谢谢", "xièxie", "Cảm ơn"],
    ].map(([hanzi, pinyin, meaning_vi], index) => ({
      lesson_code: "L01",
      order: index + 1,
      hanzi,
      pinyin,
      meaning_vi,
      example_zh: "",
      example_pinyin: "",
      example_vi: "",
      audio_file: "",
      tags: "test",
    }));
    try {
      await db.insert(localUsers).values(
        actors.map((actor) => ({
          id: actor.id,
          username: `${prefix}-${actor.role}`,
          displayName: "Disposable write authorization actor",
          passwordHash: DUMMY_PASSWORD_HASH,
          role: actor.role,
        }))
      );
      const created = await createAuthorLesson(author, {
        courseTitle: "Authorization test",
        slug: prefix,
        unitTitle: "Test unit",
        lessonTitle: "Published history",
        lessonCode: "L01",
        order: 1,
      });
      const preview = await previewRows(author, created.lessonId, rows);
      assert.ok(preview.receipt);
      await saveRows(author, {
        lessonId: created.lessonId,
        rows: preview.rows,
        receipt: preview.receipt,
        mode: "update",
      });
      await transitionLesson(admin, {
        lessonId: created.lessonId,
        action: "publish",
      });
      const publishedQuestions = await db
        .select()
        .from(schema.challenges)
        .where(eq(schema.challenges.lessonId, created.lessonId));
      const questionIds = publishedQuestions.map((question) => question.id);
      const options = await db
        .select()
        .from(schema.challengeOptions)
        .where(inArray(schema.challengeOptions.challengeId, questionIds));
      const correct = options.find((option) => option.correct)!;
      await db
        .insert(schema.userProgress)
        .values({
          userId: learnerId,
          activeCourseId: created.courseId,
          points: 137,
        });
      await db
        .insert(schema.challengeProgress)
        .values({
          userId: learnerId,
          challengeId: correct.challengeId,
          completed: true,
        });
      await db
        .insert(schema.exerciseAttempts)
        .values({
          userId: learnerId,
          challengeId: correct.challengeId,
          optionId: correct.id,
          isCorrect: true,
        });
      const draft = await transitionLesson(author, {
        lessonId: created.lessonId,
        action: "clone",
      });
      const editedRows = rows.map((row) => ({
        ...row,
        tags: "must-not-be-saved-by-revoked-actor",
      }));
      const editedPreview = await previewRows(
        author,
        draft.lessonId,
        editedRows
      );
      assert.ok(editedPreview.receipt);

      const contentSnapshot = async () => ({
        courses: await db
          .select()
          .from(schema.courses)
          .where(eq(schema.courses.createdBy, author.id))
          .orderBy(schema.courses.id),
        lessons: await db
          .select()
          .from(schema.lessons)
          .where(eq(schema.lessons.unitId, created.unitId))
          .orderBy(schema.lessons.id),
        vocabulary: await db
          .select()
          .from(schema.vocabularyEntries)
          .where(
            inArray(schema.vocabularyEntries.lessonId, [
              created.lessonId,
              draft.lessonId,
            ])
          )
          .orderBy(schema.vocabularyEntries.id),
        questions: await db
          .select()
          .from(schema.challenges)
          .where(
            inArray(schema.challenges.lessonId, [
              created.lessonId,
              draft.lessonId,
            ])
          )
          .orderBy(schema.challenges.id),
        options: await db
          .select()
          .from(schema.challengeOptions)
          .where(inArray(schema.challengeOptions.challengeId, questionIds))
          .orderBy(schema.challengeOptions.id),
        history: await db
          .select()
          .from(schema.exerciseAttempts)
          .where(eq(schema.exerciseAttempts.userId, learnerId))
          .orderBy(schema.exerciseAttempts.id),
        completions: await db
          .select()
          .from(schema.challengeProgress)
          .where(eq(schema.challengeProgress.userId, learnerId))
          .orderBy(schema.challengeProgress.id),
        progress: await db
          .select()
          .from(schema.userProgress)
          .where(eq(schema.userProgress.userId, learnerId))
          .orderBy(schema.userProgress.userId),
      });
      const before = await contentSnapshot();
      const operations = [
        {
          name: "create",
          actor: author,
          revokedRole: "learner",
          execute: () =>
            createAuthorLesson(author, {
              courseTitle: "Denied create",
              slug: `${prefix}-denied`,
              unitTitle: "Denied unit",
              lessonTitle: "Denied lesson",
              lessonCode: "NO",
              order: 1,
            }),
        },
        {
          name: "save",
          actor: author,
          revokedRole: "learner",
          execute: () =>
            saveRows(author, {
              lessonId: draft.lessonId,
              rows: editedPreview.rows,
              receipt: editedPreview.receipt,
              mode: "update",
              replace: true,
            }),
        },
        {
          name: "publish",
          actor: admin,
          revokedRole: "author",
          execute: () =>
            transitionLesson(admin, {
              lessonId: draft.lessonId,
              action: "publish",
            }),
        },
      ];
      for (const operation of operations) {
        for (const change of ["lock", "demote"] as const) {
          const blocker = await observer.connect();
          let open = false;
          let settled = false;
          let result: Promise<{ error: unknown }> | undefined;
          try {
            await blocker.query("BEGIN");
            open = true;
            const [{ pid }] = (
              await blocker.query<{ pid: number }>(
                "SELECT pg_backend_pid() AS pid"
              )
            ).rows;
            await blocker.query(
              "UPDATE users SET active = $2, role = $3 WHERE id = $1",
              [
                operation.actor.id,
                change !== "lock",
                change === "demote"
                  ? operation.revokedRole
                  : operation.actor.role,
              ]
            );
            // Actor was captured by request authentication before this revocation.
            // The content transaction must wait on the writer's uncommitted row.
            result = operation
              .execute()
              .then(
                () => ({ error: undefined }),
                (error: unknown) => ({ error })
              )
              .finally(() => {
                settled = true;
              });
            let blocked = false;
            for (let attempt = 0; attempt < 250 && !settled; attempt++) {
              const observed = await observer.query<{ waiting: boolean }>(
                "SELECT EXISTS (SELECT 1 FROM pg_stat_activity WHERE $1 = ANY(pg_blocking_pids(pid))) AS waiting",
                [pid]
              );
              if (observed.rows[0].waiting) {
                blocked = true;
                break;
              }
              await delay(20);
            }
            assert.equal(
              blocked,
              true,
              `${operation.name}/${change} must lock actor before writing`
            );
            await blocker.query("COMMIT");
            open = false;
            const denied = await result;
            assert.equal(
              (denied.error as { status?: number } | undefined)?.status,
              403,
              `${operation.name}/${change} must reject revoked actor`
            );
            assert.deepEqual(
              await contentSnapshot(),
              before,
              `${operation.name}/${change} must preserve drafts and published learner history`
            );
          } finally {
            if (open) await blocker.query("ROLLBACK");
            blocker.release();
            await result;
            await db
              .update(localUsers)
              .set({ active: true, role: operation.actor.role })
              .where(eq(localUsers.id, operation.actor.id));
          }
        }
      }
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
      const owned = await db
        .select({ id: schema.courses.id })
        .from(schema.courses)
        .where(
          inArray(
            schema.courses.createdBy,
            actors.map((actor) => actor.id)
          )
        );
      if (owned.length) {
        const ownedUnits = await db
          .select({ id: schema.units.id })
          .from(schema.units)
          .where(
            inArray(
              schema.units.courseId,
              owned.map((course) => course.id)
            )
          );
        if (ownedUnits.length) {
          const ownedLessons = await db
            .select({ id: schema.lessons.id })
            .from(schema.lessons)
            .where(
              inArray(
                schema.lessons.unitId,
                ownedUnits.map((unit) => unit.id)
              )
            );
          if (ownedLessons.length) {
            await db.delete(schema.challenges).where(
              inArray(
                schema.challenges.lessonId,
                ownedLessons.map((lesson) => lesson.id)
              )
            );
            await db.delete(schema.vocabularyEntries).where(
              inArray(
                schema.vocabularyEntries.lessonId,
                ownedLessons.map((lesson) => lesson.id)
              )
            );
          }
        }
        await db.delete(schema.courses).where(
          inArray(
            schema.courses.id,
            owned.map((course) => course.id)
          )
        );
      }
      await db.delete(localUsers).where(
        inArray(
          localUsers.id,
          actors.map((actor) => actor.id)
        )
      );
      await observer.end();
      await appPool.end();
    }
  }
);
