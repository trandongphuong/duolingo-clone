CREATE INDEX "challenges_lesson_idx" ON "challenges" USING btree ("lesson_id");--> statement-breakpoint
CREATE INDEX "attempts_user_time_idx" ON "exercise_attempts" USING btree ("user_id","answered_at");--> statement-breakpoint
CREATE INDEX "review_due_idx" ON "review_schedules" USING btree ("user_id","due_at");--> statement-breakpoint
ALTER TABLE "challenges" ADD CONSTRAINT "challenges_lesson_id_source_key_unique" UNIQUE("lesson_id","source_key");