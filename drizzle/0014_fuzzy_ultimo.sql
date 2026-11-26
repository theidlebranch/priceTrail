CREATE TABLE "accounts" (
	"account_id" text PRIMARY KEY NOT NULL,
	"display_name" text,
	"email" text,
	"registered_at" timestamp with time zone NOT NULL,
	"last_signed_in_at" timestamp with time zone NOT NULL,
	CONSTRAINT "accounts_id_is_provider_account" CHECK ("accounts"."account_id" ~ '^google:[A-Za-z0-9_-]+$' OR "accounts"."account_id" ~ '^github:[0-9]+$'),
	CONSTRAINT "accounts_name_and_email_are_blank_or_filled" CHECK (("accounts"."display_name" IS NULL OR length(btrim("accounts"."display_name")) > 0) AND ("accounts"."email" IS NULL OR length(btrim("accounts"."email")) > 0)),
	CONSTRAINT "accounts_last_sign_in_is_not_before_registration" CHECK ("accounts"."last_signed_in_at" >= "accounts"."registered_at")
);
