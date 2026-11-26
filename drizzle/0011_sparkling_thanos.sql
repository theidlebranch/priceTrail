CREATE TYPE "public"."candidate_kind" AS ENUM('new_name', 'retirement');--> statement-breakpoint
CREATE TABLE "model_limits" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "model_limits_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"model_id" bigint NOT NULL,
	"source_id" bigint NOT NULL,
	"max_input_tokens" integer,
	"max_output_tokens" integer,
	"observed_at" timestamp with time zone NOT NULL,
	CONSTRAINT "model_limits_model_id" UNIQUE("model_id"),
	CONSTRAINT "model_limits_has_a_token_count" CHECK (("model_limits"."max_input_tokens" IS NULL OR "model_limits"."max_input_tokens" > 0) AND ("model_limits"."max_output_tokens" IS NULL OR "model_limits"."max_output_tokens" > 0) AND ("model_limits"."max_input_tokens" IS NOT NULL OR "model_limits"."max_output_tokens" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "candidate_models" ADD COLUMN "kind" "candidate_kind" DEFAULT 'new_name' NOT NULL;--> statement-breakpoint
ALTER TABLE "candidate_models" ADD COLUMN "hint" text;--> statement-breakpoint
ALTER TABLE "witness_reads" ADD COLUMN "retiring_slugs" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "model_limits" ADD CONSTRAINT "model_limits_model_id_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."models"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model_limits" ADD CONSTRAINT "model_limits_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE restrict ON UPDATE no action;