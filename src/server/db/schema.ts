import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  bigint,
  boolean,
  check,
  date,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";

/**
 * Identity tables for build-plan step 9.
 *
 * An id is a bigint identity column: Postgres counts 1, 2, 3.
 * mode: "number" means JavaScript receives a normal number, which is
 * enough while these ids stay small. Public pages will use slugs, not ids.
 *
 * onDelete: "restrict" means deleting a lab fails while a model still
 * points at it. A cascade would delete those models with no extra warning.
 *
 * A lab is the company that released the model. A host such as Azure can
 * sell that model later. The host lives on offerings.platform, not here.
 */

export const labs = pgTable("labs", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  name: text("name").notNull(),
  // Unique so two rows cannot both be the lab "openai".
  slug: text("slug").notNull().unique(),
});

export const models = pgTable(
  "models",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    labId: bigint("lab_id", { mode: "number" })
      .notNull()
      .references(() => labs.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    // Unique together with lab_id, not on its own. Two labs may use the
    // same slug.
    slug: text("slug").notNull(),
    // Empty until the model is retired. timestamptz keeps the clock offset.
    deprecatedAt: timestamp("deprecated_at", { withTimezone: true }),
  },
  (table) => [unique("models_lab_id_slug").on(table.labId, table.slug)],
);

/**
 * Other names for one model. alias is unique across every lab, so a
 * lookup does not need to know the lab first.
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

/**
 * One way a model is sold. MVP uses region "global".
 * Region is required, not empty, because a unique key treats NULL as
 * "different from every other NULL". Two global rows could then exist.
 * platform stays plain text until the allowed words are decided.
 */
export const offerings = pgTable(
  "offerings",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    modelId: bigint("model_id", { mode: "number" })
      .notNull()
      .references(() => models.id, { onDelete: "restrict" }),
    platform: text("platform").notNull(),
    region: text("region").notNull().default("global"),
  },
  (table) => [
    unique("offerings_model_id_platform_region").on(table.modelId, table.platform, table.region),
  ],
);

/**
 * One period of prices for one offering. The amounts live in
 * price_components. A new price does not create a new offering. It adds a
 * row here and fills last_seen_at on the older open row.
 *
 * The chart start is announced_on when that is filled, otherwise the
 * calendar day of first_seen_at. last_seen_at blank means this row is
 * still the current price. Its value, once filled, is the last fetch that
 * still showed this price, not the time the next row was inserted.
 *
 * retracted_at blank means this is a real period. Public pages skip a
 * filled value. replaces_version_id is only for a trust view. A normal
 * price change does not point at the previous row.
 */
export const priceVersions = pgTable("price_versions", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  offeringId: bigint("offering_id", { mode: "number" })
    .notNull()
    .references(() => offerings.id, { onDelete: "restrict" }),
  firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull(),
  announcedOn: date("announced_on"),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
  retractedAt: timestamp("retracted_at", { withTimezone: true }),
  replacesVersionId: bigint("replaces_version_id", { mode: "number" }).references(
    (): AnyPgColumn => priceVersions.id,
    { onDelete: "restrict" },
  ),
});

/**
 * Same list as src/core/pricing/shape.ts. A new dimension is a new row
 * here, plus one new enum value. It is not a new column on this table.
 * OpenAI's October page used one cache_write column. The November page
 * names cache_write_30m and cache_write_12h. Those are not the 5-minute
 * or 1-hour prices.
 */
export const priceDimension = pgEnum("price_dimension", [
  "input",
  "output",
  "cache_read",
  "cache_write_5m",
  "cache_write_1h",
  "cache_write",
  "cache_write_30m",
  "cache_write_12h",
]);

/** MVP stores USD per 1 million tokens. A later unit needs a new enum value. */
export const priceUnit = pgEnum("price_unit", ["usd_per_1m_tokens"]);

/**
 * One amount inside a price version. input, output, and cache prices are
 * rows, not columns, so a new kind of price does not change this table's shape.
 *
 * amount is numeric, returned to JavaScript as a string. A number would
 * turn 0.1 into a float.
 * condition defaults to {} so "no tier" is one value. NULL would not match
 * NULL in the unique key, and two base input prices could be stored.
 */
export const priceComponents = pgTable(
  "price_components",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    priceVersionId: bigint("price_version_id", { mode: "number" })
      .notNull()
      .references(() => priceVersions.id, { onDelete: "restrict" }),
    dimension: priceDimension("dimension").notNull(),
    unit: priceUnit("unit").notNull(),
    amount: numeric("amount", { mode: "string" }).notNull(),
    condition: jsonb("condition").notNull().default({}),
  },
  (table) => [
    unique("price_components_price_version_id_dimension_condition").on(
      table.priceVersionId,
      table.dimension,
      table.condition,
    ),
  ],
);

/**
 * One page we keep checking. A lab is the company that released the model.
 * A source is the page. They are not the same row.
 *
 * url is unique so two rows cannot both be the same pricing page.
 * type is a Postgres enum. A new kind of page needs a new migration.
 * Which parser runs for a url lives in code next to the fetcher, not on
 * this row. active defaults to true, so a new source is checked until
 * someone turns it off. last_checked_at is the latest check, including a
 * check where the parsed page did not change.
 */
export const sourceType = pgEnum("source_type", [
  "official",
  "wayback",
  "aggregator",
  "announcement",
  "changelog_feed",
  "platform_api",
]);

export const sources = pgTable("sources", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  url: text("url").notNull().unique(),
  type: sourceType("type").notNull(),
  active: boolean("active").notNull().default(true),
  lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
});

/**
 * One fetch whose parsed content changed. An unchanged check is only a
 * fetch_log row. content_hash covers parsed_data, not the raw page.
 * raw_content_hash covers the stored page text.
 *
 * parsed_data is jsonb. This table does not validate that JSON. The
 * pipeline checks it later, before any price is published.
 * archive_status defaults to pending. A blank archive_url means there is
 * no Wayback permalink yet.
 */
export const archiveStatus = pgEnum("archive_status", ["pending", "archived", "failed"]);

export const observations = pgTable("observations", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  sourceId: bigint("source_id", { mode: "number" })
    .notNull()
    .references(() => sources.id, { onDelete: "restrict" }),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull(),
  contentHash: text("content_hash").notNull(),
  rawContent: text("raw_content").notNull(),
  rawContentHash: text("raw_content_hash").notNull(),
  parsedData: jsonb("parsed_data").notNull(),
  archiveUrl: text("archive_url"),
  archiveStatus: archiveStatus("archive_status").notNull().default("pending"),
});

/**
 * One tracked offering on one observation. The price list, including
 * tiers, lives once on the observation in parsed_data. This row is the
 * offering, the cell-check result, and the review stamp. The same
 * offering cannot appear twice on the same snapshot. A model with no
 * offering is not a row here.
 *
 * review_status defaults to flagged. A forgotten status must not look
 * ready to publish. Only ok and confirmed may be passed to
 * publishPriceVersion(). This table does not write a price.
 */
export const reviewStatus = pgEnum("review_status", ["ok", "flagged", "confirmed", "rejected"]);

export const observationItems = pgTable(
  "observation_items",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    observationId: bigint("observation_id", { mode: "number" })
      .notNull()
      .references(() => observations.id, { onDelete: "restrict" }),
    offeringId: bigint("offering_id", { mode: "number" })
      .notNull()
      .references(() => offerings.id, { onDelete: "restrict" }),
    groundingResult: jsonb("grounding_result"),
    reviewStatus: reviewStatus("review_status").notNull().default("flagged"),
    reviewedBy: text("reviewed_by"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewNote: text("review_note"),
  },
  (table) => [
    unique("observation_items_observation_id_offering_id").on(
      table.observationId,
      table.offeringId,
    ),
  ],
);

/**
 * The snapshot that opened one published price.
 *
 * The two ids are the primary key, so one price can later keep a second
 * proof. This step writes one row: the observation item passed to
 * publishPriceVersion(). The Wayback permalink stays on the observation.
 * A blank archive_url means that opening snapshot was never archived.
 */
export const priceVersionEvidence = pgTable(
  "price_version_evidence",
  {
    priceVersionId: bigint("price_version_id", { mode: "number" })
      .notNull()
      .references(() => priceVersions.id, { onDelete: "restrict" }),
    observationItemId: bigint("observation_item_id", { mode: "number" })
      .notNull()
      .references(() => observationItems.id, { onDelete: "restrict" }),
  },
  (table) => [
    primaryKey({
      columns: [table.priceVersionId, table.observationItemId],
    }),
  ],
);

/**
 * One row for every check of a source, including a check where nothing
 * changed. http_status is empty when the connection failed and there was
 * no response. Guessing 200 would hide that.
 *
 * observation_id is required when outcome is changed, and must be empty
 * for every other outcome. A parser_suspect or fetch_error row cannot
 * point at an observation. A parser break is not a stored page change.
 * observation_id is unique, so one snapshot belongs to one changed row.
 * Postgres still allows many blank links, so unchanged rows stay valid.
 */
export const fetchOutcome = pgEnum("fetch_outcome", [
  "unchanged",
  "changed",
  "parser_suspect",
  "fetch_error",
]);

export const fetchLog = pgTable(
  "fetch_log",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    sourceId: bigint("source_id", { mode: "number" })
      .notNull()
      .references(() => sources.id, { onDelete: "restrict" }),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull(),
    httpStatus: integer("http_status"),
    outcome: fetchOutcome("outcome").notNull(),
    observationId: bigint("observation_id", { mode: "number" }).references(() => observations.id, {
      onDelete: "restrict",
    }),
    note: text("note"),
  },
  (table) => [
    unique("fetch_log_observation_id").on(table.observationId),
    check(
      "fetch_log_observation_matches_outcome",
      sql`(${table.outcome} = 'changed' AND ${table.observationId} IS NOT NULL) OR (${table.outcome} <> 'changed' AND ${table.observationId} IS NULL)`,
    ),
  ],
);

/**
 * One attempt to read a witness file, such as the LiteLLM cost map.
 *
 * A failed attempt stores the sentence and leaves the previous findings
 * alone. agreed_count and not_compared_count are empty unless the read
 * succeeded. seen_slugs is the model ids in that file. The first success
 * is the baseline: is_baseline is true only then.
 */
export const witnessReadOutcome = pgEnum("witness_read_outcome", [
  "ok",
  "fetch_error",
  "parse_error",
]);

export const witnessReads = pgTable(
  "witness_reads",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    sourceId: bigint("source_id", { mode: "number" })
      .notNull()
      .references(() => sources.id, { onDelete: "restrict" }),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull(),
    outcome: witnessReadOutcome("outcome").notNull(),
    note: text("note").notNull().default(""),
    seenSlugs: jsonb("seen_slugs").$type<string[]>().notNull().default([]),
    isBaseline: boolean("is_baseline").notNull().default(false),
    agreedCount: integer("agreed_count"),
    notComparedCount: integer("not_compared_count"),
  },
  (table) => [
    check(
      "witness_reads_counts_match_outcome",
      sql`(${table.outcome} = 'ok' AND ${table.agreedCount} IS NOT NULL AND ${table.notComparedCount} IS NOT NULL) OR (${table.outcome} <> 'ok' AND ${table.agreedCount} IS NULL AND ${table.notComparedCount} IS NULL AND ${table.isBaseline} = false)`,
    ),
  ],
);

/**
 * One dimension where a witness amount differs from the open price.
 * A successful read replaces this source's unresolved rows. A row that
 * already has resolved_at stays. This table does not publish a price.
 */
export const verificationFlagResolution = pgEnum("verification_flag_resolution", [
  "reverified_same",
  "price_updated",
  "human_confirmed",
  "human_rejected",
]);

export const verificationFlags = pgTable("verification_flags", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  offeringId: bigint("offering_id", { mode: "number" })
    .notNull()
    .references(() => offerings.id, { onDelete: "restrict" }),
  sourceId: bigint("source_id", { mode: "number" })
    .notNull()
    .references(() => sources.id, { onDelete: "restrict" }),
  dimension: priceDimension("dimension").notNull(),
  detectedAt: timestamp("detected_at", { withTimezone: true }).notNull(),
  aggregatorValue: text("aggregator_value").notNull(),
  ourValue: text("our_value").notNull(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  resolution: verificationFlagResolution("resolution"),
});

/**
 * A model name a witness saw that we do not track yet.
 * One row per source and slug. Rejected stays rejected so the name
 * does not come back. Approve is a later step and is not written here.
 */
export const candidateStatus = pgEnum("candidate_status", [
  "pending_review",
  "approved",
  "rejected",
]);

export const candidateModels = pgTable(
  "candidate_models",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    labId: bigint("lab_id", { mode: "number" })
      .notNull()
      .references(() => labs.id, { onDelete: "restrict" }),
    rawName: text("raw_name").notNull(),
    rawSlug: text("raw_slug").notNull(),
    sourceId: bigint("source_id", { mode: "number" })
      .notNull()
      .references(() => sources.id, { onDelete: "restrict" }),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull(),
    status: candidateStatus("status").notNull().default("pending_review"),
    resolvedModelId: bigint("resolved_model_id", { mode: "number" }).references(() => models.id, {
      onDelete: "restrict",
    }),
    reviewedBy: text("reviewed_by"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewNote: text("review_note"),
  },
  (table) => [unique("candidate_models_source_id_raw_slug").on(table.sourceId, table.rawSlug)],
);

/**
 * The current not-linked and missing list for one witness.
 * A successful read replaces this source's rows. not_linked means we
 * have no match. missing means the previous read matched and this one
 * does not. Neither kind sets deprecated_at.
 */
export const modelSignalKind = pgEnum("model_signal_kind", ["not_linked", "missing"]);

export const modelSignals = pgTable(
  "model_signals",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    modelId: bigint("model_id", { mode: "number" })
      .notNull()
      .references(() => models.id, { onDelete: "restrict" }),
    sourceId: bigint("source_id", { mode: "number" })
      .notNull()
      .references(() => sources.id, { onDelete: "restrict" }),
    kind: modelSignalKind("kind").notNull(),
    detectedAt: timestamp("detected_at", { withTimezone: true }).notNull(),
  },
  (table) => [unique("model_signals_source_id_model_id").on(table.sourceId, table.modelId)],
);
