CREATE TYPE "public"."follow_kind" AS ENUM('model', 'lab');--> statement-breakpoint
CREATE TABLE "follows" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "follows_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"account_id" text NOT NULL,
	"kind" "follow_kind" NOT NULL,
	"model_id" bigint,
	"lab_id" bigint,
	"followed_at" timestamp with time zone NOT NULL,
	CONSTRAINT "follows_account_id_is_provider_account" CHECK ("follows"."account_id" ~ '^google:[A-Za-z0-9_-]+$' OR "follows"."account_id" ~ '^github:[0-9]+$'),
	CONSTRAINT "follows_kind_matches_one_target" CHECK (("follows"."kind" = 'model' AND "follows"."model_id" IS NOT NULL AND "follows"."lab_id" IS NULL) OR ("follows"."kind" = 'lab' AND "follows"."lab_id" IS NOT NULL AND "follows"."model_id" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "follows" ADD CONSTRAINT "follows_model_id_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."models"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follows" ADD CONSTRAINT "follows_lab_id_labs_id_fk" FOREIGN KEY ("lab_id") REFERENCES "public"."labs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "follows_one_model" ON "follows" USING btree ("account_id","model_id") WHERE "follows"."kind" = 'model';--> statement-breakpoint
CREATE UNIQUE INDEX "follows_one_lab" ON "follows" USING btree ("account_id","lab_id") WHERE "follows"."kind" = 'lab';