CREATE TYPE "public"."archive_status" AS ENUM('pending', 'archived', 'failed');--> statement-breakpoint
CREATE TYPE "public"."fetch_outcome" AS ENUM('unchanged', 'changed', 'parser_suspect', 'fetch_error');--> statement-breakpoint
CREATE TYPE "public"."review_status" AS ENUM('ok', 'flagged', 'confirmed', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."source_adapter" AS ENUM('markdown-docs-table', 'json-api', 'pdf-rate-card', 'html-marketing-page', 'rss-feed');--> statement-breakpoint
CREATE TYPE "public"."source_type" AS ENUM('official_current', 'official_pdf', 'wayback', 'aggregator', 'announcement', 'changelog_feed', 'platform_api');--> statement-breakpoint
CREATE TABLE "fetch_log" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "fetch_log_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"source_id" bigint NOT NULL,
	"fetched_at" timestamp with time zone NOT NULL,
	"http_status" integer,
	"outcome" "fetch_outcome" NOT NULL,
	"observation_id" bigint,
	"note" text,
	CONSTRAINT "fetch_log_observation_matches_outcome" CHECK (("fetch_log"."outcome" = 'changed' AND "fetch_log"."observation_id" IS NOT NULL) OR ("fetch_log"."outcome" <> 'changed' AND "fetch_log"."observation_id" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "observation_items" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "observation_items_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"observation_id" bigint NOT NULL,
	"offering_id" bigint NOT NULL,
	"parsed_item" jsonb NOT NULL,
	"grounding_result" jsonb,
	"review_status" "review_status" DEFAULT 'flagged' NOT NULL,
	"reviewed_by" text,
	"reviewed_at" timestamp with time zone,
	"review_note" text,
	CONSTRAINT "observation_items_observation_id_offering_id" UNIQUE("observation_id","offering_id")
);
--> statement-breakpoint
CREATE TABLE "observations" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "observations_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"source_id" bigint NOT NULL,
	"fetched_at" timestamp with time zone NOT NULL,
	"content_hash" text NOT NULL,
	"raw_content" text NOT NULL,
	"raw_content_hash" text NOT NULL,
	"parsed_data" jsonb NOT NULL,
	"archive_url" text,
	"archive_status" "archive_status" DEFAULT 'pending' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sources" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "sources_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"url" text NOT NULL,
	"type" "source_type" NOT NULL,
	"adapter" "source_adapter" NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"last_checked_at" timestamp with time zone,
	"last_changed_at" timestamp with time zone,
	"etag" text,
	"last_modified" text,
	CONSTRAINT "sources_url_unique" UNIQUE("url")
);
--> statement-breakpoint
ALTER TABLE "fetch_log" ADD CONSTRAINT "fetch_log_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fetch_log" ADD CONSTRAINT "fetch_log_observation_id_observations_id_fk" FOREIGN KEY ("observation_id") REFERENCES "public"."observations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "observation_items" ADD CONSTRAINT "observation_items_observation_id_observations_id_fk" FOREIGN KEY ("observation_id") REFERENCES "public"."observations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "observation_items" ADD CONSTRAINT "observation_items_offering_id_offerings_id_fk" FOREIGN KEY ("offering_id") REFERENCES "public"."offerings"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "observations" ADD CONSTRAINT "observations_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE restrict ON UPDATE no action;