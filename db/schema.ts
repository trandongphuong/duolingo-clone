import { relations, sql } from "drizzle-orm";
import {
  boolean,
  integer,
  index,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  unique,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { MAX_HEARTS } from "@/constants";

export const contentStatus = pgEnum("content_status", [
  "draft",
  "review",
  "published",
  "archived",
]);

export const courses = pgTable("courses", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  imageSrc: text("image_src").notNull(),
  slug: text("slug").unique(),
  description: text("description").notNull().default(""),
  status: contentStatus("status").notNull().default("draft"),
  createdBy: text("created_by"),
  sampleUnreviewed: boolean("sample_unreviewed").notNull().default(true),
});

export const coursesRelations = relations(courses, ({ many }) => ({
  userProgress: many(userProgress),
  units: many(units),
}));

export const units = pgTable("units", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(), // Unit 1
  description: text("description").notNull(), // Learn the basics of spanish
  courseId: integer("course_id")
    .references(() => courses.id, {
      onDelete: "cascade",
    })
    .notNull(),
  order: integer("order").notNull(),
});

export const unitsRelations = relations(units, ({ many, one }) => ({
  course: one(courses, {
    fields: [units.courseId],
    references: [courses.id],
  }),
  lessons: many(lessons),
}));

export const lessons = pgTable(
  "lessons",
  {
    id: serial("id").primaryKey(),
    code: text("code").notNull().default(""),
    description: text("description").notNull().default(""),
    status: contentStatus("status").notNull().default("draft"),
    version: integer("version").notNull().default(1),
    previousVersionId: integer("previous_version_id"),
    title: text("title").notNull(),
    unitId: integer("unit_id")
      .references(() => units.id, {
        onDelete: "cascade",
      })
      .notNull(),
    order: integer("order").notNull(),
  },
  (t) => [
    uniqueIndex("lesson_family_version_unique")
      .on(t.unitId, t.code, t.version)
      .where(sql`${t.code} <> ''`),
  ]
);

export const lessonsRelations = relations(lessons, ({ one, many }) => ({
  unit: one(units, {
    fields: [lessons.unitId],
    references: [units.id],
  }),
  challenges: many(challenges),
  vocabulary: many(vocabularyEntries),
}));

export const challengesEnum = pgEnum("type", ["SELECT", "ASSIST"]);

export const challenges = pgTable(
  "challenges",
  {
    id: serial("id").primaryKey(),
    lessonId: integer("lesson_id")
      .references(() => lessons.id, {
        onDelete: "cascade",
      })
      .notNull(),
    type: challengesEnum("type").notNull(),
    question: text("question").notNull(),
    order: integer("order").notNull(),
    vocabularyId: integer("vocabulary_id"),
    sourceKey: text("source_key"),
  },
  (t) => [
    unique().on(t.lessonId, t.sourceKey),
    index("challenges_lesson_idx").on(t.lessonId),
  ]
);

export const challengesRelations = relations(challenges, ({ one, many }) => ({
  lesson: one(lessons, {
    fields: [challenges.lessonId],
    references: [lessons.id],
  }),
  challengeOptions: many(challengeOptions),
  challengeProgress: many(challengeProgress),
}));

export const challengeOptions = pgTable("challenge_options", {
  id: serial("id").primaryKey(),
  challengeId: integer("challenge_id")
    .references(() => challenges.id, {
      onDelete: "cascade",
    })
    .notNull(),
  text: text("text").notNull(),
  correct: boolean("correct").notNull(),
  imageSrc: text("image_src"),
  audioSrc: text("audio_src"),
});

export const challengeOptionsRelations = relations(
  challengeOptions,
  ({ one }) => ({
    challenge: one(challenges, {
      fields: [challengeOptions.challengeId],
      references: [challenges.id],
    }),
  })
);

export const challengeProgress = pgTable(
  "challenge_progress",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull(),
    challengeId: integer("challenge_id")
      .references(() => challenges.id, {
        onDelete: "cascade",
      })
      .notNull(),
    completed: boolean("completed").notNull().default(false),
  },
  (t) => [unique().on(t.userId, t.challengeId)]
);

export const challengeProgressRelations = relations(
  challengeProgress,
  ({ one }) => ({
    challenge: one(challenges, {
      fields: [challengeProgress.challengeId],
      references: [challenges.id],
    }),
  })
);

export const userProgress = pgTable("user_progress", {
  userId: text("user_id").primaryKey(),
  userName: text("user_name").notNull().default("User"),
  userImageSrc: text("user_image_src").notNull().default("/mascot.svg"),
  activeCourseId: integer("active_course_id").references(() => courses.id, {
    onDelete: "cascade",
  }),
  hearts: integer("hearts").notNull().default(MAX_HEARTS),
  points: integer("points").notNull().default(0),
});

export const userProgressRelations = relations(userProgress, ({ one }) => ({
  activeCourse: one(courses, {
    fields: [userProgress.activeCourseId],
    references: [courses.id],
  }),
}));

export const userSubscription = pgTable("user_subscription", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().unique(),
  stripeCustomerId: text("stripe_customer_id").notNull().unique(),
  stripeSubscriptionId: text("stripe_subscription_id").notNull().unique(),
  stripePriceId: text("stripe_price_id").notNull(),
  stripeCurrentPeriodEnd: timestamp("stripe_current_period_end").notNull(),
});

export const vocabularyEntries = pgTable(
  "vocabulary_entries",
  {
    id: serial("id").primaryKey(),
    lessonId: integer("lesson_id")
      .notNull()
      .references(() => lessons.id, { onDelete: "restrict" }),
    sourceKey: text("source_key").notNull(),
    order: integer("order").notNull(),
    hanzi: text("hanzi").notNull(),
    pinyin: text("pinyin").notNull(),
    meaningVi: text("meaning_vi").notNull(),
    exampleZh: text("example_zh").notNull().default(""),
    examplePinyin: text("example_pinyin").notNull().default(""),
    exampleVi: text("example_vi").notNull().default(""),
    audioPath: text("audio_path"),
    tags: text("tags").notNull().default(""),
    sourceNote: text("source_note")
      .notNull()
      .default("Dữ liệu mẫu chưa kiểm duyệt"),
  },
  (t) => [unique().on(t.lessonId, t.sourceKey)]
);

export const vocabularyEntriesRelations = relations(
  vocabularyEntries,
  ({ one }) => ({
    lesson: one(lessons, {
      fields: [vocabularyEntries.lessonId],
      references: [lessons.id],
    }),
  })
);

export const exerciseAttempts = pgTable(
  "exercise_attempts",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull(),
    challengeId: integer("challenge_id")
      .notNull()
      .references(() => challenges.id, { onDelete: "restrict" }),
    optionId: integer("option_id").notNull(),
    isCorrect: boolean("is_correct").notNull(),
    answeredAt: timestamp("answered_at").notNull().defaultNow(),
  },
  (t) => [index("attempts_user_time_idx").on(t.userId, t.answeredAt)]
);

export const reviewSchedules = pgTable(
  "review_schedules",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull(),
    vocabularyId: integer("vocabulary_id")
      .notNull()
      .references(() => vocabularyEntries.id, { onDelete: "restrict" }),
    step: integer("step").notNull().default(0),
    dueAt: timestamp("due_at").notNull().defaultNow(),
    lastResult: boolean("last_result").notNull().default(false),
  },
  (t) => [
    unique().on(t.userId, t.vocabularyId),
    index("review_due_idx").on(t.userId, t.dueAt),
  ]
);

export const mediaFiles = pgTable("media_files", {
  id: text("id").primaryKey(),
  path: text("path").notNull().unique(),
  mime: text("mime").notNull(),
  size: integer("size").notNull(),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export { localUsers, sessions, loginAttempts } from "./auth-schema";
