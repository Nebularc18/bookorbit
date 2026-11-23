ALTER TABLE "audiobook_progress" ADD COLUMN "mirrored_from_ebook" boolean;--> statement-breakpoint
ALTER TABLE "hardcover_book_state" ADD COLUMN "last_synced_format" varchar(20);