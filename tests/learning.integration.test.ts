import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const testUrl = process.env.TEST_DATABASE_URL;

test(
  "PostgreSQL grading, replay, authorization and learner payload",
  { skip: !testUrl },
  async () => {
    assert.match(
      new URL(testUrl!).pathname,
      /test|e2e/,
      "Use a disposable test database only"
    );
    process.env.DATABASE_URL = testUrl;
    const { default: db, pool } = await import("../db/drizzle");
    const schema = await import("../db/schema");
    const { eq, inArray } = await import("drizzle-orm");
    const { gradeAnswerForUser, loadLearnerLesson } =
      await import("../lib/learning");
    const prefix = `grading-test-${randomUUID()}`;
    const learnerId = randomUUID();
    const strangerId = randomUUID();
    let courseId = 0;
    let lessonId = 0;
    const createdChallenges: number[] = [];
    try {
      const [course] = await db
        .insert(schema.courses)
        .values({
          title: prefix,
          imageSrc: "/han-ngu-bien.svg",
          status: "published",
        })
        .returning();
      courseId = course.id;
      const [unit] = await db
        .insert(schema.units)
        .values({
          title: prefix,
          description: "Integration fixture",
          order: 1,
          courseId,
        })
        .returning();
      const [lesson] = await db
        .insert(schema.lessons)
        .values({
          title: prefix,
          unitId: unit.id,
          order: 1,
          status: "published",
        })
        .returning();
      lessonId = lesson.id;
      const [word] = await db
        .insert(schema.vocabularyEntries)
        .values({
          lessonId,
          sourceKey: prefix,
          order: 1,
          hanzi: "你好",
          pinyin: "nǐ hǎo",
          meaningVi: "Xin chào",
        })
        .returning();
      const [challenge] = await db
        .insert(schema.challenges)
        .values({
          lessonId,
          type: "SELECT",
          question: "你好",
          order: 1,
          vocabularyId: word.id,
        })
        .returning();
      const [otherChallenge] = await db
        .insert(schema.challenges)
        .values({ lessonId, type: "ASSIST", question: "Cảm ơn", order: 2 })
        .returning();
      createdChallenges.push(challenge.id, otherChallenge.id);
      const [correct, wrong] = await db
        .insert(schema.challengeOptions)
        .values([
          { challengeId: challenge.id, text: "Xin chào", correct: true },
          { challengeId: challenge.id, text: "Tạm biệt", correct: false },
        ])
        .returning();
      const [foreignOption] = await db
        .insert(schema.challengeOptions)
        .values({ challengeId: otherChallenge.id, text: "谢谢", correct: true })
        .returning();
      await db
        .insert(schema.userProgress)
        .values({ userId: learnerId, activeCourseId: courseId, points: 0 });
      await db
        .insert(schema.userProgress)
        .values({ userId: strangerId, points: 0 });

      const payload = await loadLearnerLesson(learnerId, lessonId);
      assert.ok(payload);
      for (const question of payload.challenges)
        for (const option of question.challengeOptions) {
          assert.equal(
            "correct" in option,
            false,
            "answer key must not enter learner payload"
          );
        }
      assert.equal(await loadLearnerLesson(strangerId, lessonId), null);
      await assert.rejects(
        gradeAnswerForUser(strangerId, challenge.id, correct.id),
        /chưa được chọn/
      );
      await assert.rejects(
        gradeAnswerForUser(learnerId, challenge.id, foreignOption.id),
        /không hợp lệ/
      );
      await assert.rejects(gradeAnswerForUser(learnerId, -1, correct.id));

      const incorrect = await gradeAnswerForUser(
        learnerId,
        challenge.id,
        wrong.id
      );
      assert.equal(incorrect.correct, false);
      assert.equal(incorrect.awardedPoints, 0);
      const results = await Promise.all(
        Array.from({ length: 8 }, () =>
          gradeAnswerForUser(learnerId, challenge.id, correct.id)
        )
      );
      assert.equal(
        results.reduce((sum, result) => sum + result.awardedPoints, 0),
        10,
        "concurrent requests award credit once"
      );
      const replay = await gradeAnswerForUser(
        learnerId,
        challenge.id,
        correct.id
      );
      assert.equal(replay.awardedPoints, 0);
      const [progress] = await db
        .select()
        .from(schema.userProgress)
        .where(eq(schema.userProgress.userId, learnerId));
      assert.equal(progress.points, 10);
      const completions = await db
        .select()
        .from(schema.challengeProgress)
        .where(eq(schema.challengeProgress.userId, learnerId));
      assert.equal(completions.length, 1);
      const [schedule] = await db
        .select()
        .from(schema.reviewSchedules)
        .where(eq(schema.reviewSchedules.userId, learnerId));
      assert.equal(
        schedule.step,
        1,
        "immediate replays do not advance review schedule"
      );
      assert.equal(schedule.lastResult, true);
      assert.equal(
        (await loadLearnerLesson(learnerId, lessonId))?.challenges[0].completed,
        true,
        "reload restores completed progress"
      );
      await db
        .update(schema.reviewSchedules)
        .set({ dueAt: new Date(Date.now() - 60_000) })
        .where(eq(schema.reviewSchedules.id, schedule.id));
      const dueReview = await Promise.all(
        Array.from({ length: 4 }, () =>
          gradeAnswerForUser(learnerId, challenge.id, correct.id)
        )
      );
      assert.equal(
        dueReview.reduce((sum, result) => sum + result.awardedPoints, 0),
        0,
        "due reviews never award repeat credit"
      );
      const [advanced] = await db
        .select()
        .from(schema.reviewSchedules)
        .where(eq(schema.reviewSchedules.id, schedule.id));
      assert.equal(
        advanced.step,
        2,
        "one due review advances once under concurrency"
      );

      await db
        .update(schema.lessons)
        .set({ status: "draft" })
        .where(eq(schema.lessons.id, lessonId));
      assert.equal(await loadLearnerLesson(learnerId, lessonId), null);
      await assert.rejects(
        gradeAnswerForUser(learnerId, challenge.id, correct.id),
        /không hợp lệ/
      );
    } finally {
      if (createdChallenges.length) {
        await db
          .delete(schema.exerciseAttempts)
          .where(
            inArray(schema.exerciseAttempts.challengeId, createdChallenges)
          );
        await db
          .delete(schema.challengeProgress)
          .where(
            inArray(schema.challengeProgress.challengeId, createdChallenges)
          );
      }
      await db
        .delete(schema.reviewSchedules)
        .where(eq(schema.reviewSchedules.userId, learnerId));
      if (lessonId)
        await db
          .delete(schema.vocabularyEntries)
          .where(eq(schema.vocabularyEntries.lessonId, lessonId));
      await db
        .delete(schema.userProgress)
        .where(inArray(schema.userProgress.userId, [learnerId, strangerId]));
      if (courseId)
        await db.delete(schema.courses).where(eq(schema.courses.id, courseId));
      await pool.end();
    }
  }
);
