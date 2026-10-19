CREATE TABLE "works" (
	"id" serial PRIMARY KEY NOT NULL,
	"library_id" integer NOT NULL,
	"user_id" integer,
	"title" varchar(1000) NOT NULL,
	CONSTRAINT "works_id_library_unique" UNIQUE("id","library_id")
);
--> statement-breakpoint
ALTER TABLE "books" ADD COLUMN "work_id" integer;--> statement-breakpoint
ALTER TABLE "works" ADD CONSTRAINT "works_library_id_libraries_id_fk" FOREIGN KEY ("library_id") REFERENCES "public"."libraries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "works" ADD CONSTRAINT "works_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "works_library_idx" ON "works" USING btree ("library_id");--> statement-breakpoint
ALTER TABLE "books" ADD CONSTRAINT "books_work_library_fk" FOREIGN KEY ("work_id","library_id") REFERENCES "public"."works"("id","library_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "books_work_id_idx" ON "books" USING btree ("work_id");