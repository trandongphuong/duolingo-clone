import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";
import { test } from "node:test";

import { Pool } from "pg";

const testUrl = process.env.TEST_DATABASE_URL;
const runFile = promisify(execFile);

test(
  "Re-run migration và seed giữ nguyên khóa tự soạn, điểm và lịch sử đã học",
  { skip: !testUrl, timeout: 120_000 },
  async () => {
    assert.match(
      new URL(testUrl!).pathname,
      /test|e2e/,
      "Chỉ chạy với DB test dùng một lần."
    );
    const pool = new Pool({ connectionString: testUrl });
    const userId = randomUUID();
    const prefix = `seed-preserve-${userId}`;
    let courseId = 0;
    try {
      await pool.query(
        "INSERT INTO users(id,username,display_name,password_hash,active) VALUES($1,$2,$2,'disabled-integration-fixture',false)",
        [userId, prefix]
      );
      const created = await pool.query<{ id: number }>(
        "INSERT INTO courses(title,image_src,slug,status,sample_unreviewed) VALUES($1,'/han-ngu-bien.svg',$1,'published',false) RETURNING id",
        [prefix]
      );
      courseId = created.rows[0].id;
      const unit = await pool.query<{ id: number }>(
        'INSERT INTO units(title,description,course_id,"order") VALUES($1,$1,$2,1) RETURNING id',
        [prefix, courseId]
      );
      const lesson = await pool.query<{ id: number }>(
        "INSERT INTO lessons(title,unit_id,\"order\",status) VALUES($1,$2,1,'published') RETURNING id",
        [prefix, unit.rows[0].id]
      );
      const challenge = await pool.query<{ id: number }>(
        "INSERT INTO challenges(lesson_id,type,question,\"order\") VALUES($1,'SELECT',$2,1) RETURNING id",
        [lesson.rows[0].id, prefix]
      );
      const option = await pool.query<{ id: number }>(
        "INSERT INTO challenge_options(challenge_id,text,correct) VALUES($1,'Đúng',true) RETURNING id",
        [challenge.rows[0].id]
      );
      await pool.query(
        "INSERT INTO user_progress(user_id,user_name,active_course_id,points) VALUES($1,$2,$3,137)",
        [userId, prefix, courseId]
      );
      await pool.query(
        "INSERT INTO challenge_progress(user_id,challenge_id,completed) VALUES($1,$2,true)",
        [userId, challenge.rows[0].id]
      );
      await pool.query(
        "INSERT INTO exercise_attempts(user_id,challenge_id,option_id,is_correct) VALUES($1,$2,$3,true)",
        [userId, challenge.rows[0].id, option.rows[0].id]
      );
      const env = { ...process.env, DATABASE_URL: testUrl };
      for (const script of [
        "scripts/migrate.ts",
        "scripts/seed.ts",
        "scripts/migrate.ts",
        "scripts/seed.ts",
      ]) {
        const result = await runFile(
          process.execPath,
          ["--import", "tsx", script],
          { env, timeout: 45_000, maxBuffer: 1024 * 1024 }
        );
        assert.ok(result.stdout.trim(), `${script} phải có bằng chứng chạy`);
      }
      const course = await pool.query(
        "SELECT title,sample_unreviewed FROM courses WHERE id=$1",
        [courseId]
      );
      assert.equal(course.rows[0].title, prefix);
      assert.equal(course.rows[0].sample_unreviewed, false);
      const progress = await pool.query(
        "SELECT active_course_id,points FROM user_progress WHERE user_id=$1",
        [userId]
      );
      assert.equal(progress.rows[0].active_course_id, courseId);
      assert.equal(progress.rows[0].points, 137);
      const completion = await pool.query(
        "SELECT completed FROM challenge_progress WHERE user_id=$1",
        [userId]
      );
      assert.equal(completion.rows.length, 1);
      assert.equal(completion.rows[0].completed, true);
      assert.equal(
        (
          await pool.query(
            "SELECT id FROM exercise_attempts WHERE user_id=$1",
            [userId]
          )
        ).rows.length,
        1
      );
      const counts = await pool.query<{
        lessons: string;
        vocabulary: string;
        challenges: string;
        options: string;
      }>(`
      SELECT
        (SELECT count(*) FROM lessons l JOIN units u ON l.unit_id=u.id JOIN courses c ON c.id=u.course_id WHERE c.slug='hnb-demo-zh-v1') AS lessons,
        (SELECT count(*) FROM vocabulary_entries v JOIN lessons l ON l.id=v.lesson_id JOIN units u ON l.unit_id=u.id JOIN courses c ON c.id=u.course_id WHERE c.slug='hnb-demo-zh-v1') AS vocabulary,
        (SELECT count(*) FROM challenges x JOIN lessons l ON l.id=x.lesson_id JOIN units u ON l.unit_id=u.id JOIN courses c ON c.id=u.course_id WHERE c.slug='hnb-demo-zh-v1') AS challenges,
        (SELECT count(*) FROM challenge_options o JOIN challenges x ON x.id=o.challenge_id JOIN lessons l ON l.id=x.lesson_id JOIN units u ON l.unit_id=u.id JOIN courses c ON c.id=u.course_id WHERE c.slug='hnb-demo-zh-v1') AS options
    `);
      assert.deepEqual(counts.rows[0], {
        lessons: "10",
        vocabulary: "100",
        challenges: "200",
        options: "800",
      });
    } finally {
      await pool.query("DELETE FROM exercise_attempts WHERE user_id=$1", [
        userId,
      ]);
      await pool.query("DELETE FROM challenge_progress WHERE user_id=$1", [
        userId,
      ]);
      await pool.query("DELETE FROM user_progress WHERE user_id=$1", [userId]);
      if (courseId)
        await pool.query("DELETE FROM courses WHERE id=$1", [courseId]);
      await pool.query("DELETE FROM users WHERE id=$1", [userId]);
      await pool.end();
    }
  }
);
