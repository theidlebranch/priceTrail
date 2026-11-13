CREATE TABLE "price_version_evidence" (
	"price_version_id" bigint NOT NULL,
	"observation_item_id" bigint NOT NULL,
	CONSTRAINT "price_version_evidence_price_version_id_observation_item_id_pk" PRIMARY KEY("price_version_id","observation_item_id")
);
--> statement-breakpoint
ALTER TABLE "price_version_evidence" ADD CONSTRAINT "price_version_evidence_price_version_id_price_versions_id_fk" FOREIGN KEY ("price_version_id") REFERENCES "public"."price_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_version_evidence" ADD CONSTRAINT "price_version_evidence_observation_item_id_observation_items_id_fk" FOREIGN KEY ("observation_item_id") REFERENCES "public"."observation_items"("id") ON DELETE restrict ON UPDATE no action;