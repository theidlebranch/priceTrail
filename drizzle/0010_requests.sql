CREATE TYPE "public"."request_kind" AS ENUM('lab');--> statement-breakpoint
CREATE TYPE "public"."request_status" AS ENUM('pending', 'accepted', 'declined');--> statement-breakpoint
CREATE TABLE "requests" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "requests_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"kind" "request_kind" NOT NULL,
	"lab_name" text NOT NULL,
	"lab_name_key" text NOT NULL,
	"suggested_by" text NOT NULL,
	"suggested_at" timestamp with time zone NOT NULL,
	"status" "request_status" DEFAULT 'pending' NOT NULL,
	"reviewed_by" text,
	"reviewed_at" timestamp with time zone,
	"review_note" text,
	CONSTRAINT "requests_lab_name_key_matches_name" CHECK ("requests"."kind" = 'lab' AND length(btrim("requests"."lab_name")) > 0 AND "requests"."lab_name_key" = lower(btrim("requests"."lab_name")) AND length(btrim("requests"."suggested_by")) > 0),
	CONSTRAINT "requests_decision_matches_status" CHECK (("requests"."status" = 'pending' AND "requests"."reviewed_by" IS NULL AND "requests"."reviewed_at" IS NULL AND "requests"."review_note" IS NULL) OR ("requests"."status" <> 'pending' AND "requests"."reviewed_by" IS NOT NULL AND "requests"."reviewed_at" IS NOT NULL AND "requests"."review_note" IS NOT NULL AND length(btrim("requests"."review_note")) > 0))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "requests_one_pending_lab" ON "requests" USING btree ("kind","lab_name_key") WHERE "requests"."status" = 'pending';