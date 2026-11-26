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
  uniqueIndex,
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
 *
 * retiring_slugs is the filtered chat ids that were already retiring on
 * that read. Official model lists use it so a later read can tell a new
 * retirement from an old one. Aggregator reads leave it empty. A missing
 * id is not stored here and does not retire a model.
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
    retiringSlugs: jsonb("retiring_slugs").$type<string[]>().notNull().default([]),
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
 * A model name a witness saw that we do not track yet, a retirement
 * hint, or a tracked model missing from the pricing page.
 * One row per source, slug, and kind. An approved new-name card can
 * sit beside a later retirement or gone card. A rejected card of that
 * kind does not come back. A rejected new-name card also blocks a
 * retirement card, so Accept cannot create a model the reviewer already
 * refused. A pending new-name card becomes the retirement card when the
 * page note says retired or deprecated. An official pricing-page
 * new-name card can be added and published. Approve on a witness or
 * model-list new name
 * adds the model and does not publish a price. Accept on a retirement
 * or gone card sets deprecated_at and does not publish a price.
 *
 * kind new_name is a model we do not track. kind retirement is a
 * shutdown date, a deprecated or retired lifecycle, or a pricing-page
 * note that says retired or deprecated. kind gone is a tracked model
 * missing from two good pricing visits. hint is the sentence the
 * review page shows. A new-name card leaves hint empty.
 */
export const candidateStatus = pgEnum("candidate_status", [
  "pending_review",
  "approved",
  "rejected",
]);

export const candidateKind = pgEnum("candidate_kind", ["new_name", "retirement", "gone"]);

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
    kind: candidateKind("kind").notNull().default("new_name"),
    hint: text("hint"),
    resolvedModelId: bigint("resolved_model_id", { mode: "number" }).references(() => models.id, {
      onDelete: "restrict",
    }),
    reviewedBy: text("reviewed_by"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewNote: text("review_note"),
  },
  (table) => [
    unique("candidate_models_source_id_raw_slug_kind").on(
      table.sourceId,
      table.rawSlug,
      table.kind,
    ),
  ],
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

/**
 * A request to visit one official pricing page sooner than the schedule.
 *
 * source_id is that official page, not the witness that noticed the
 * disagreement. reason names why the visit was asked for. This step only
 * writes aggregator_disagreement. created_at is when the witness read
 * stored the disagreement. processed_at stays blank until that visit is
 * filed. One blank processed_at per source, so two witnesses cannot queue
 * the same page twice before the visit runs. This table does not publish
 * a price.
 */
export const fetchTriggerReason = pgEnum("fetch_trigger_reason", ["aggregator_disagreement"]);

export const fetchTriggers = pgTable(
  "fetch_triggers",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    sourceId: bigint("source_id", { mode: "number" })
      .notNull()
      .references(() => sources.id, { onDelete: "restrict" }),
    reason: fetchTriggerReason("reason").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("fetch_triggers_one_pending_source")
      .on(table.sourceId)
      .where(sql`${table.processedAt} IS NULL`),
  ],
);

/**
 * A suggestion from a signed-in visitor.
 *
 * kind is lab for this step. A later step can add a page URL as another
 * kind on this same table. lab_name is the name they typed. lab_name_key
 * is that name trimmed and lowercased, so "OpenAI" and " openai " are
 * one pending suggestion. Accepting a row does not insert a lab, a
 * source, or a schedule. status pending has no reviewer stamp. accepted
 * and declined store the reviewer, the time, and a note. This table
 * does not publish a price.
 */
export const requestKind = pgEnum("request_kind", ["lab"]);

export const requestStatus = pgEnum("request_status", ["pending", "accepted", "declined"]);

export const requests = pgTable(
  "requests",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    kind: requestKind("kind").notNull(),
    labName: text("lab_name").notNull(),
    labNameKey: text("lab_name_key").notNull(),
    suggestedBy: text("suggested_by").notNull(),
    suggestedAt: timestamp("suggested_at", { withTimezone: true }).notNull(),
    status: requestStatus("status").notNull().default("pending"),
    reviewedBy: text("reviewed_by"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewNote: text("review_note"),
  },
  (table) => [
    uniqueIndex("requests_one_pending_lab")
      .on(table.kind, table.labNameKey)
      .where(sql`${table.status} = 'pending'`),
    check(
      "requests_lab_name_key_matches_name",
      sql`${table.kind} = 'lab' AND length(btrim(${table.labName})) > 0 AND ${table.labNameKey} = lower(btrim(${table.labName})) AND length(btrim(${table.suggestedBy})) > 0`,
    ),
    check(
      "requests_decision_matches_status",
      sql`(${table.status} = 'pending' AND ${table.reviewedBy} IS NULL AND ${table.reviewedAt} IS NULL AND ${table.reviewNote} IS NULL) OR (${table.status} <> 'pending' AND ${table.reviewedBy} IS NOT NULL AND ${table.reviewedAt} IS NOT NULL AND ${table.reviewNote} IS NOT NULL AND length(btrim(${table.reviewNote})) > 0)`,
    ),
  ],
);

/**
 * The latest input and output token limits for one model we already track.
 *
 * One row per model. source_id is the platform_api list that said the
 * numbers. At least one of the two counts is filled. A later successful
 * read replaces the numbers and observed_at. A failed read or a missing
 * key leaves the row alone. OpenAI's list has no token numbers, so an
 * OpenAI model has no row. This table does not store a price.
 */
export const modelLimits = pgTable(
  "model_limits",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    modelId: bigint("model_id", { mode: "number" })
      .notNull()
      .references(() => models.id, { onDelete: "restrict" }),
    sourceId: bigint("source_id", { mode: "number" })
      .notNull()
      .references(() => sources.id, { onDelete: "restrict" }),
    maxInputTokens: integer("max_input_tokens"),
    maxOutputTokens: integer("max_output_tokens"),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    unique("model_limits_model_id").on(table.modelId),
    check(
      "model_limits_has_a_token_count",
      sql`(${table.maxInputTokens} IS NULL OR ${table.maxInputTokens} > 0) AND (${table.maxOutputTokens} IS NULL OR ${table.maxOutputTokens} > 0) AND (${table.maxInputTokens} IS NOT NULL OR ${table.maxOutputTokens} IS NOT NULL)`,
    ),
  ],
);

/**
 * One row per Google or GitHub account that has signed in.
 *
 * account_id is google:<id> or github:<numeric id>, the same id the
 * rest of the app already stores. display_name and email are whatever
 * the provider sent. A missing name or email stays empty. registered_at
 * is the first stored sign-in and does not move. last_signed_in_at
 * moves on a later sign-in. A page view does not write this table.
 * This table does not store a price.
 */
export const accounts = pgTable(
  "accounts",
  {
    accountId: text("account_id").primaryKey(),
    displayName: text("display_name"),
    email: text("email"),
    registeredAt: timestamp("registered_at", { withTimezone: true }).notNull(),
    lastSignedInAt: timestamp("last_signed_in_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    check(
      "accounts_id_is_provider_account",
      sql`${table.accountId} ~ '^google:[A-Za-z0-9_-]+$' OR ${table.accountId} ~ '^github:[0-9]+$'`,
    ),
    check(
      "accounts_name_and_email_are_blank_or_filled",
      sql`(${table.displayName} IS NULL OR length(btrim(${table.displayName})) > 0) AND (${table.email} IS NULL OR length(btrim(${table.email})) > 0)`,
    ),
    check(
      "accounts_last_sign_in_is_not_before_registration",
      sql`${table.lastSignedInAt} >= ${table.registeredAt}`,
    ),
  ],
);
