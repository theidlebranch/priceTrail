CREATE TYPE "public"."effective_basis" AS ENUM('announced', 'observed');--> statement-breakpoint
CREATE TYPE "public"."price_dimension" AS ENUM('input', 'output', 'cache_read', 'cache_write_5m', 'cache_write_1h', 'cache_write');--> statement-breakpoint
CREATE TYPE "public"."price_unit" AS ENUM('usd_per_1m_tokens');--> statement-breakpoint
CREATE TYPE "public"."price_version_kind" AS ENUM('regular', 'correction');--> statement-breakpoint
CREATE TABLE "offerings" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "offerings_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"model_id" bigint NOT NULL,
	"platform" text NOT NULL,
	"region" text DEFAULT 'global' NOT NULL,
	CONSTRAINT "offerings_model_id_platform_region" UNIQUE("model_id","platform","region")
);
--> statement-breakpoint
CREATE TABLE "price_components" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "price_components_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"price_version_id" bigint NOT NULL,
	"dimension" "price_dimension" NOT NULL,
	"unit" "price_unit" NOT NULL,
	"amount" numeric NOT NULL,
	"condition" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "price_components_price_version_id_dimension_condition" UNIQUE("price_version_id","dimension","condition")
);
--> statement-breakpoint
CREATE TABLE "price_versions" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "price_versions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"offering_id" bigint NOT NULL,
	"effective_from" date NOT NULL,
	"effective_until" date,
	"effective_basis" "effective_basis" NOT NULL,
	"changed_after" timestamp with time zone,
	"first_observed_at" timestamp with time zone,
	"announced_effective_at" date,
	"kind" "price_version_kind" NOT NULL,
	"supersedes_id" bigint,
	"primary_item_id" bigint,
	"last_confirmed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "offerings" ADD CONSTRAINT "offerings_model_id_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."models"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_components" ADD CONSTRAINT "price_components_price_version_id_price_versions_id_fk" FOREIGN KEY ("price_version_id") REFERENCES "public"."price_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_versions" ADD CONSTRAINT "price_versions_offering_id_offerings_id_fk" FOREIGN KEY ("offering_id") REFERENCES "public"."offerings"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_versions" ADD CONSTRAINT "price_versions_supersedes_id_price_versions_id_fk" FOREIGN KEY ("supersedes_id") REFERENCES "public"."price_versions"("id") ON DELETE restrict ON UPDATE no action;