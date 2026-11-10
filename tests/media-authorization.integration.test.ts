import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

import { Pool } from "pg";

const testUrl = process.env.TEST_DATABASE_URL;

test(
  "Media remains private to owner/admin until attached to published content",
  { skip: !testUrl, timeout: 30_000 },
  async () => {
    assert.match(new URL(testUrl!).pathname, /test|e2e/, "Only use a test DB.");
    process.env.DATABASE_URL = testUrl;
    const [{ canReadMedia }, { checkMedia }, { pool: appPool }] =
      await Promise.all([
        import("../lib/media-access"),
        import("../lib/content"),
        import("../db/drizzle"),
      ]);
    const mediaDirectory = await mkdtemp(
      path.join(tmpdir(), "hnb-media-authorization-")
    );
    process.env.MEDIA_DIR = mediaDirectory;
    const pool = new Pool({ connectionString: testUrl });
    const owner = { id: randomUUID(), role: "author" };
    const otherAuthor = { id: randomUUID(), role: "author" };
    const learner = { id: randomUUID(), role: "learner" };
    const admin = { id: randomUUID(), role: "admin" };
    const mediaId = randomUUID();
    const media = { path: `/api/media/${mediaId}`, createdBy: owner.id };
    const rows = [
      {
        lesson_code: "L01",
        order: 1,
        hanzi: "你好",
        pinyin: "nǐ hǎo",
        meaning_vi: "Xin chào",
        example_zh: "",
        example_pinyin: "",
        example_vi: "",
        audio_file: media.path,
        tags: "",
      },
    ];
    let courseId = 0;
    let lessonId = 0;
    try {
      await writeFile(
        path.join(mediaDirectory, mediaId),
        await readFile("data/test-tone.wav")
      );
      await pool.query(
        "INSERT INTO media_files(id,path,mime,size,created_by) VALUES($1,$2,'audio/wav',8044,$3)",
        [mediaId, media.path, owner.id]
      );
      assert.equal(
        (await checkMedia(rows, owner)).length,
        0,
        "Upload owner can attach own file"
      );
      assert.equal(
        (await checkMedia(rows, admin)).length,
        0,
        "Admin can attach any approved file"
      );
      assert.equal(
        (await checkMedia(rows, otherAuthor)).length,
        1,
        "Other author cannot reattach private upload"
      );
      const created = await pool.query<{ id: number }>(
        "INSERT INTO courses(title,image_src,status,created_by) VALUES($1,'/han-ngu-bien.svg','draft',$2) RETURNING id",
        [`media-auth-${randomUUID()}`, owner.id]
      );
      courseId = created.rows[0].id;
      const unit = await pool.query<{ id: number }>(
        "INSERT INTO units(title,description,course_id,\"order\") VALUES($1,'',$2,1) RETURNING id",
        ["Media authorization fixture", courseId]
      );
      const lesson = await pool.query<{ id: number }>(
        "INSERT INTO lessons(title,unit_id,\"order\",status) VALUES($1,$2,1,'draft') RETURNING id",
        ["Draft media", unit.rows[0].id]
      );
      lessonId = lesson.rows[0].id;
      assert.equal(await canReadMedia(null, media), false);
      assert.equal(await canReadMedia(owner, media), true);
      assert.equal(await canReadMedia(admin, media), true);
      assert.equal(await canReadMedia(otherAuthor, media), false);
      assert.equal(await canReadMedia(learner, media), false);

      await pool.query(
        "INSERT INTO vocabulary_entries(lesson_id,source_key,\"order\",hanzi,pinyin,meaning_vi,audio_path) VALUES($1,$2,1,'你好','nǐ hǎo','Xin chào',$3)",
        [lessonId, randomUUID(), media.path]
      );
      assert.equal(
        await canReadMedia(learner, media),
        false,
        "Draft attachment stays private"
      );
      await pool.query("UPDATE lessons SET status='published' WHERE id=$1", [
        lessonId,
      ]);
      assert.equal(
        await canReadMedia(learner, media),
        false,
        "Course must also be published"
      );
      await pool.query("UPDATE courses SET status='published' WHERE id=$1", [
        courseId,
      ]);
      assert.equal(await canReadMedia(learner, media), true);
      assert.equal(await canReadMedia(otherAuthor, media), true);
      assert.equal(
        (await checkMedia(rows, otherAuthor)).length,
        0,
        "Published media can be reused"
      );
      await pool.query("UPDATE lessons SET status='archived' WHERE id=$1", [
        lessonId,
      ]);
      assert.equal(
        await canReadMedia(learner, media),
        false,
        "Archived lesson no longer publishes audio"
      );
      await pool.query("UPDATE courses SET image_src=$1 WHERE id=$2", [
        media.path,
        courseId,
      ]);
      assert.equal(
        await canReadMedia(learner, media),
        true,
        "Published cover media remains available"
      );
      await pool.query("UPDATE courses SET status='draft' WHERE id=$1", [
        courseId,
      ]);
      assert.equal(await canReadMedia(learner, media), false);
    } finally {
      if (lessonId)
        await pool.query("DELETE FROM vocabulary_entries WHERE lesson_id=$1", [
          lessonId,
        ]);
      if (courseId)
        await pool.query("DELETE FROM courses WHERE id=$1", [courseId]);
      await pool.query("DELETE FROM media_files WHERE id=$1", [mediaId]);
      await rm(mediaDirectory, { recursive: true, force: true });
      await pool.end();
      await appPool.end();
    }
  }
);
