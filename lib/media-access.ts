import { and, eq } from "drizzle-orm";

import db from "@/db/drizzle";
import { courses, lessons, units, vocabularyEntries } from "@/db/schema";

type MediaActor = { id: string; role: string };
type MediaRecord = { path: string; createdBy: string };

/** Uploaded files remain private until a published lesson/course references them. */
export async function canReadMedia(
  actor: MediaActor | null,
  media: MediaRecord
): Promise<boolean> {
  if (!actor) return false;
  if (actor.role === "admin" || media.createdBy === actor.id) return true;

  const [publishedVocabulary] = await db
    .select({ id: vocabularyEntries.id })
    .from(vocabularyEntries)
    .innerJoin(lessons, eq(vocabularyEntries.lessonId, lessons.id))
    .innerJoin(units, eq(lessons.unitId, units.id))
    .innerJoin(courses, eq(units.courseId, courses.id))
    .where(
      and(
        eq(vocabularyEntries.audioPath, media.path),
        eq(lessons.status, "published"),
        eq(courses.status, "published")
      )
    )
    .limit(1);
  if (publishedVocabulary) return true;

  const [publishedCourse] = await db
    .select({ id: courses.id })
    .from(courses)
    .where(
      and(eq(courses.imageSrc, media.path), eq(courses.status, "published"))
    )
    .limit(1);
  return Boolean(publishedCourse);
}
