CREATE TYPE "public"."candidate_status" AS ENUM('pending_review', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."model_signal_kind" AS ENUM('not_linked', 'missing');--> statement-breakpoint
CREATE TYPE "public"."verification_flag_resolution" AS ENUM('reverified_same', 'price_updated', 'human_confirmed', 'human_rejected');--> statement-breakpoint
CREATE TYPE "public"."witness_read_outcome" AS ENUM('ok', 'fetch_error', 'parse_error');--> statement-breakpoint
CREATE TABLE "candidate_models" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "candidate_models_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"lab_id" bigint NOT NULL,
	"raw_name" text NOT NULL,
	"raw_slug" text NOT NULL,
	"source_id" bigint NOT NULL,
	"first_seen_at" timestamp with time zone NOT NULL,
	"status" "candidate_status" DEFAULT 'pending_review' NOT NULL,
	"resolved_model_id" bigint,
	"reviewed_by" text,
	"reviewed_at" timestamp with time zone,
	"review_note" text,
	CONSTRAINT "candidate_models_source_id_raw_slug" UNIQUE("source_id","raw_slug")
);
--> statement-breakpoint
CREATE TABLE "model_signals" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "model_signals_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"model_id" bigint NOT NULL,
	"source_id" bigint NOT NULL,
	"kind" "model_signal_kind" NOT NULL,
	"detected_at" timestamp with time zone NOT NULL,
	CONSTRAINT "model_signals_source_id_model_id" UNIQUE("source_id","model_id")
);
--> statement-breakpoint
CREATE TABLE "verification_flags" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "verification_flags_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"offering_id" bigint NOT NULL,
	"source_id" bigint NOT NULL,
	"dimension" "price_dimension" NOT NULL,
	"detected_at" timestamp with time zone NOT NULL,
	"aggregator_value" text NOT NULL,
	"our_value" text NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolution" "verification_flag_resolution"
);
--> statement-breakpoint
CREATE TABLE "witness_reads" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "witness_reads_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"source_id" bigint NOT NULL,
	"fetched_at" timestamp with time zone NOT NULL,
	"outcome" "witness_read_outcome" NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"seen_slugs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_baseline" boolean DEFAULT false NOT NULL,
	"agreed_count" integer,
	"not_compared_count" integer,
	CONSTRAINT "witness_reads_counts_match_outcome" CHECK (("witness_reads"."outcome" = 'ok' AND "witness_reads"."agreed_count" IS NOT NULL AND "witness_reads"."not_compared_count" IS NOT NULL) OR ("witness_reads"."outcome" <> 'ok' AND "witness_reads"."agreed_count" IS NULL AND "witness_reads"."not_compared_count" IS NULL AND "witness_reads"."is_baseline" = false))
);
--> statement-breakpoint
ALTER TABLE "candidate_models" ADD CONSTRAINT "candidate_models_lab_id_labs_id_fk" FOREIGN KEY ("lab_id") REFERENCES "public"."labs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_models" ADD CONSTRAINT "candidate_models_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_models" ADD CONSTRAINT "candidate_models_resolved_model_id_models_id_fk" FOREIGN KEY ("resolved_model_id") REFERENCES "public"."models"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model_signals" ADD CONSTRAINT "model_signals_model_id_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."models"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model_signals" ADD CONSTRAINT "model_signals_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_flags" ADD CONSTRAINT "verification_flags_offering_id_offerings_id_fk" FOREIGN KEY ("offering_id") REFERENCES "public"."offerings"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_flags" ADD CONSTRAINT "verification_flags_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "witness_reads" ADD CONSTRAINT "witness_reads_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE restrict ON UPDATE no action;