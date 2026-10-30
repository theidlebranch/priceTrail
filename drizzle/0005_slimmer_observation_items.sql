ALTER TABLE "observation_items" DROP COLUMN "parsed_item";--> statement-breakpoint
ALTER TABLE "fetch_log" ADD CONSTRAINT "fetch_log_observation_id" UNIQUE("observation_id");