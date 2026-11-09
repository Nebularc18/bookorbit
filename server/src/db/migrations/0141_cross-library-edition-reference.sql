ALTER TABLE "books" DROP CONSTRAINT "books_work_library_fk";
--> statement-breakpoint
ALTER TABLE "books" ADD CONSTRAINT "books_work_id_works_id_fk" FOREIGN KEY ("work_id") REFERENCES "public"."works"("id") ON DELETE set null ON UPDATE no action;