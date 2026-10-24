ALTER TABLE "providers" RENAME TO "labs";--> statement-breakpoint
ALTER TABLE "labs" RENAME CONSTRAINT "providers_slug_unique" TO "labs_slug_unique";--> statement-breakpoint
ALTER SEQUENCE "providers_id_seq" RENAME TO "labs_id_seq";--> statement-breakpoint
ALTER TABLE "models" RENAME COLUMN "provider_id" TO "lab_id";--> statement-breakpoint
ALTER TABLE "models" RENAME CONSTRAINT "models_provider_id_slug" TO "models_lab_id_slug";--> statement-breakpoint
ALTER TABLE "models" RENAME CONSTRAINT "models_provider_id_providers_id_fk" TO "models_lab_id_labs_id_fk";--> statement-breakpoint
ALTER TABLE "price_versions" DROP CONSTRAINT "price_versions_supersedes_id_price_versions_id_fk";--> statement-breakpoint
ALTER TABLE "price_versions" DROP COLUMN "effective_from";--> statement-breakpoint
ALTER TABLE "price_versions" DROP COLUMN "effective_until";--> statement-breakpoint
ALTER TABLE "price_versions" DROP COLUMN "effective_basis";--> statement-breakpoint
ALTER TABLE "price_versions" DROP COLUMN "changed_after";--> statement-breakpoint
ALTER TABLE "price_versions" DROP COLUMN "first_observed_at";--> statement-breakpoint
ALTER TABLE "price_versions" DROP COLUMN "announced_effective_at";--> statement-breakpoint
ALTER TABLE "price_versions" DROP COLUMN "kind";--> statement-breakpoint
ALTER TABLE "price_versions" DROP COLUMN "supersedes_id";--> statement-breakpoint
ALTER TABLE "price_versions" DROP COLUMN "primary_item_id";--> statement-breakpoint
ALTER TABLE "price_versions" DROP COLUMN "last_confirmed_at";--> statement-breakpoint
DROP TYPE "public"."effective_basis";--> statement-breakpoint
DROP TYPE "public"."price_version_kind";--> statement-breakpoint
ALTER TABLE "price_versions" ADD COLUMN "first_seen_at" timestamp with time zone NOT NULL;--> statement-breakpoint
ALTER TABLE "price_versions" ADD COLUMN "announced_on" date;--> statement-breakpoint
ALTER TABLE "price_versions" ADD COLUMN "last_seen_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "price_versions" ADD COLUMN "retracted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "price_versions" ADD COLUMN "replaces_version_id" bigint;--> statement-breakpoint
ALTER TABLE "price_versions" ADD CONSTRAINT "price_versions_replaces_version_id_price_versions_id_fk" FOREIGN KEY ("replaces_version_id") REFERENCES "public"."price_versions"("id") ON DELETE restrict ON UPDATE no action;
