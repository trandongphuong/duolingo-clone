import dotenv from "dotenv";
import { and, eq, sql } from "drizzle-orm";

import {
  SAMPLE_NOTICE,
  SAMPLE_SOURCE,
  sampleLessons,
} from "../data/sample-course";
import {
  generateExercises,
  vocabularySourceKey,
} from "../lib/generate-exercises";

dotenv.config({ path: ".env.local", quiet: true });

async function main() {
  const { default: db, pool } = await import("../db/drizzle");
  const {
    challengeOptions,
    challenges,
    courses,
    lessons,
    units,
    vocabularyEntries,
  } = await import("../db/schema");
  try {
    const result = await db.transaction(async (tx) => {
      // Serialize simultaneous seed invocations without modifying any learner data.
      await tx.execute(sql`select pg_advisory_xact_lock(74820391)`);
      const slug = "hnb-demo-zh-v1";
      let course = await tx.query.courses.findFirst({
        where: eq(courses.slug, slug),
      });
      if (course && (!course.sampleUnreviewed || course.createdBy)) {
        throw new Error(
          "Mã khóa mẫu đã được dùng bởi nội dung khác; không ghi đè."
        );
      }
      if (!course) {
        [course] = await tx
          .insert(courses)
          .values({
            title: "Tiếng Trung cơ bản trên biển — bản mẫu",
            slug,
            imageSrc: "/han-ngu-bien.svg",
            description: `${SAMPLE_NOTICE}. ${SAMPLE_SOURCE} Chưa có âm thanh tiếng Trung được thẩm định.`,
            status: "published",
            sampleUnreviewed: true,
          })
          .returning();
      }
      let unit = await tx.query.units.findFirst({
        where: and(eq(units.courseId, course.id), eq(units.order, 1)),
      });
      if (!unit) {
        [unit] = await tx
          .insert(units)
          .values({
            courseId: course.id,
            order: 1,
            title: "Nền tảng, văn hóa và biển",
            description: `${SAMPLE_NOTICE} — 10 bài, 100 mục từ; chỉ dùng để thử nghiệm và chờ duyệt chuyên môn.`,
          })
          .returning();
      }
      let createdLessons = 0;
      let createdVocabulary = 0;
      let createdExercises = 0;
      for (const [index, sample] of sampleLessons.entries()) {
        const exists = await tx.query.lessons.findFirst({
          where: and(
            eq(lessons.unitId, unit.id),
            eq(lessons.code, sample.code)
          ),
        });
        // Existing lessons, edited samples and all progress are left intact.
        if (exists) continue;
        const [lesson] = await tx
          .insert(lessons)
          .values({
            code: sample.code,
            title: sample.title,
            description: `${SAMPLE_NOTICE}. ${sample.description}`,
            unitId: unit.id,
            order: index + 1,
            status: "published",
            version: 1,
          })
          .returning();
        const entries = await tx
          .insert(vocabularyEntries)
          .values(
            sample.entries.map(([hanzi, pinyin, meaningVi], order) => ({
              lessonId: lesson.id,
              sourceKey: vocabularySourceKey(hanzi),
              order: order + 1,
              hanzi,
              pinyin,
              meaningVi,
              sourceNote: SAMPLE_SOURCE,
              tags: `mau_chua_kiem_duyet;${sample.code}`,
            }))
          )
          .returning();
        const { exercises } = generateExercises(entries);
        for (const generated of exercises) {
          const [challenge] = await tx
            .insert(challenges)
            .values({
              lessonId: lesson.id,
              sourceKey: generated.sourceKey,
              vocabularyId: generated.vocabularyId,
              type: generated.type,
              question: generated.question,
              order: generated.order,
            })
            .returning();
          await tx
            .insert(challengeOptions)
            .values(
              generated.options.map((option) => ({
                ...option,
                challengeId: challenge.id,
              }))
            );
        }
        createdLessons++;
        createdVocabulary += entries.length;
        createdExercises += exercises.length;
      }
      return {
        courseId: course.id,
        createdLessons,
        createdVocabulary,
        createdExercises,
      };
    });
    console.info(JSON.stringify({ notice: SAMPLE_NOTICE, ...result }));
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : "Không thể tạo dữ liệu mẫu."
  );
  process.exitCode = 1;
});
