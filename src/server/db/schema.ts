import { bigint, pgEnum, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";

/**
 * Identity tables for build-plan step 9.
 *
 * An id is a bigint identity column: Postgres counts 1, 2, 3.
 * mode: "number" means JavaScript receives a normal number, which is
 * enough while these ids stay small. Public pages will use slugs, not ids.
 *
 * onDelete: "restrict" means deleting a provider fails while a model still
 * points at it. A cascade would delete those models with no extra warning.
 */

export const providers = pgTable("providers", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  name: text("name").notNull(),
  // Unique so two rows cannot both be the provider "openai".
  slug: text("slug").notNull().unique(),
});

export const models = pgTable(
  "models",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    providerId: bigint("provider_id", { mode: "number" })
      .notNull()
      .references(() => providers.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    // Unique together with provider_id, not on its own. Two providers may
    // use the same slug.
    slug: text("slug").notNull(),
    // Empty until the model is retired. timestamptz keeps the clock offset.
    deprecatedAt: timestamp("deprecated_at", { withTimezone: true }),
  },
  (table) => [unique("models_provider_id_slug").on(table.providerId, table.slug)],
);

/**
 * Other names for one model. alias is unique across every provider, so a
 * lookup does not need to know the provider first.
 *
 * kind is a Postgres enum. The database rejects any other word. A fifth
 * kind needs a new migration.
 */
export const modelAliasKind = pgEnum("model_alias_kind", [
  "latest_pointer",
  "dated_snapshot",
  "former_name",
  "aggregator_slug",
]);

export const modelAliases = pgTable("model_aliases", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  modelId: bigint("model_id", { mode: "number" })
    .notNull()
    .references(() => models.id, { onDelete: "restrict" }),
  alias: text("alias").notNull().unique(),
  kind: modelAliasKind("kind").notNull(),
});
