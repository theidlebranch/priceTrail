CREATE TYPE "public"."fetch_trigger_reason" AS ENUM('aggregator_disagreement');--> statement-breakpoint
CREATE TABLE "fetch_triggers" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "fetch_triggers_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"source_id" bigint NOT NULL,
	"reason" "fetch_trigger_reason" NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"processed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "fetch_triggers" ADD CONSTRAINT "fetch_triggers_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "fetch_triggers_one_pending_source" ON "fetch_triggers" USING btree ("source_id") WHERE "fetch_triggers"."processed_at" IS NULL;