ALTER TABLE "hardcover_book_state" ADD COLUMN "retry_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "hardcover_book_state" ADD COLUMN "next_retry_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "hardcover_book_state_retry_due_idx" ON "hardcover_book_state" USING btree ("next_retry_at") WHERE "hardcover_book_state"."sync_error" is not null;