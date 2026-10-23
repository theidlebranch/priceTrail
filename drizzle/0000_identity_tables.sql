CREATE TYPE "public"."model_alias_kind" AS ENUM('latest_pointer', 'dated_snapshot', 'former_name', 'aggregator_slug');--> statement-breakpoint
CREATE TABLE "model_aliases" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "model_aliases_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"model_id" bigint NOT NULL,
	"alias" text NOT NULL,
	"kind" "model_alias_kind" NOT NULL,
	CONSTRAINT "model_aliases_alias_unique" UNIQUE("alias")
);
--> statement-breakpoint
CREATE TABLE "models" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "models_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"provider_id" bigint NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"deprecated_at" timestamp with time zone,
	CONSTRAINT "models_provider_id_slug" UNIQUE("provider_id","slug")
);
--> statement-breakpoint
CREATE TABLE "providers" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "providers_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"slug" text NOT NULL,
	CONSTRAINT "providers_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "model_aliases" ADD CONSTRAINT "model_aliases_model_id_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."models"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "models" ADD CONSTRAINT "models_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."providers"("id") ON DELETE restrict ON UPDATE no action;