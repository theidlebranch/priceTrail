CREATE TABLE "alert_webhooks" (
	"account_id" text PRIMARY KEY NOT NULL,
	"slack_webhook_url" text,
	"discord_webhook_url" text,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "alert_webhooks_account_id_is_provider_account" CHECK ("alert_webhooks"."account_id" ~ '^google:[A-Za-z0-9_-]+$' OR "alert_webhooks"."account_id" ~ '^github:[0-9]+$'),
	CONSTRAINT "alert_webhooks_urls_are_blank_or_filled" CHECK (("alert_webhooks"."slack_webhook_url" IS NULL OR length(btrim("alert_webhooks"."slack_webhook_url")) > 0) AND ("alert_webhooks"."discord_webhook_url" IS NULL OR length(btrim("alert_webhooks"."discord_webhook_url")) > 0)),
	CONSTRAINT "alert_webhooks_has_one_url" CHECK ("alert_webhooks"."slack_webhook_url" IS NOT NULL OR "alert_webhooks"."discord_webhook_url" IS NOT NULL)
);
