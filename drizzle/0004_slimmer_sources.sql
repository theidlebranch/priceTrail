ALTER TABLE "sources" ALTER COLUMN "type" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."source_type";--> statement-breakpoint
CREATE TYPE "public"."source_type" AS ENUM('official', 'wayback', 'aggregator', 'announcement', 'changelog_feed', 'platform_api');--> statement-breakpoint
ALTER TABLE "sources" ALTER COLUMN "type" SET DATA TYPE "public"."source_type" USING "type"::"public"."source_type";--> statement-breakpoint
ALTER TABLE "sources" DROP COLUMN "adapter";--> statement-breakpoint
ALTER TABLE "sources" DROP COLUMN "last_changed_at";--> statement-breakpoint
ALTER TABLE "sources" DROP COLUMN "etag";--> statement-breakpoint
ALTER TABLE "sources" DROP COLUMN "last_modified";--> statement-breakpoint
DROP TYPE "public"."source_adapter";