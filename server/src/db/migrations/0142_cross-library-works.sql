ALTER TABLE "works" DROP CONSTRAINT "works_id_library_unique";--> statement-breakpoint
ALTER TABLE "works" DROP CONSTRAINT "works_library_id_libraries_id_fk";
--> statement-breakpoint
DROP INDEX "works_library_idx";--> statement-breakpoint
ALTER TABLE "works" DROP COLUMN "library_id";