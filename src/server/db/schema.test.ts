import type { InferSelectModel } from "drizzle-orm";
import { getTableConfig, type PgColumn } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import {
  archiveStatus,
  fetchOutcome,
  fetchLog,
  labs,
  modelAliasKind,
  modelAliases,
  models,
  observationItems,
  observations,
  offerings,
  priceComponents,
  priceDimension,
  priceUnit,
  priceVersions,
  reviewStatus,
  sourceType,
  sources,
} from "@/server/db/schema";

/**
 * These tests read the Drizzle table definitions. They do not open a database.
 * Postgres is what actually rejects a bad insert. This file checks that the
 * definition still asks Postgres to do that.
 */

function column(columns: PgColumn[], name: string): PgColumn {
  const match = columns.find((entry) => entry.name === name);
  if (!match) {
    throw new Error(`missing column ${name}`);
  }
  return match;
}

function foreignKeyTo(config: ReturnType<typeof getTableConfig>, columnName: string) {
  const match = config.foreignKeys.find((entry) =>
    entry.reference().columns.some((foreignColumn) => foreignColumn.name === columnName),
  );
  if (!match) {
    throw new Error(`missing foreign key on ${columnName}`);
  }
  return match;
}

describe("identity tables", () => {
  it("defines labs with a required unique slug and an identity id", () => {
    const config = getTableConfig(labs);

    expect(config.name).toBe("labs");
    expect(config.columns.map((entry) => entry.name)).toEqual(["id", "name", "slug"]);
    expect(config.foreignKeys).toEqual([]);
    expect(config.uniqueConstraints).toEqual([]);

    const id = column(config.columns, "id");
    expect(id.columnType).toBe("PgBigInt53");
    expect(id.primary).toBe(true);
    expect(id.notNull).toBe(true);
    expect(id.generatedIdentity?.type).toBe("always");

    expect(column(config.columns, "name").notNull).toBe(true);

    const slug = column(config.columns, "slug");
    expect(slug.notNull).toBe(true);
    expect(slug.isUnique).toBe(true);
  });

  it("defines models with one slug per lab and an optional deprecation time", () => {
    const config = getTableConfig(models);

    expect(config.name).toBe("models");
    expect(config.columns.map((entry) => entry.name)).toEqual([
      "id",
      "lab_id",
      "name",
      "slug",
      "deprecated_at",
    ]);

    const id = column(config.columns, "id");
    expect(id.columnType).toBe("PgBigInt53");
    expect(id.primary).toBe(true);
    expect(id.generatedIdentity?.type).toBe("always");

    const labId = column(config.columns, "lab_id");
    expect(labId.notNull).toBe(true);
    expect(labId.columnType).toBe("PgBigInt53");

    expect(column(config.columns, "name").notNull).toBe(true);
    expect(column(config.columns, "slug").notNull).toBe(true);
    expect(column(config.columns, "slug").isUnique).toBe(false);

    const deprecatedAt = column(config.columns, "deprecated_at");
    expect(deprecatedAt.notNull).toBe(false);
    expect(deprecatedAt.getSQLType()).toBe("timestamp with time zone");

    expect(config.uniqueConstraints).toHaveLength(1);
    expect(config.uniqueConstraints[0]?.columns.map((entry) => entry.name)).toEqual([
      "lab_id",
      "slug",
    ]);

    expect(config.foreignKeys).toHaveLength(1);
    const foreignKey = config.foreignKeys[0];
    expect(foreignKey).toBeDefined();
    const reference = foreignKey!.reference();
    expect(reference.columns.map((entry) => entry.name)).toEqual(["lab_id"]);
    expect(getTableConfig(reference.foreignTable).name).toBe("labs");
    expect(reference.foreignColumns.map((entry) => entry.name)).toEqual(["id"]);
    expect(foreignKey!.onDelete).toBe("restrict");
  });

  it("defines model aliases with one global alias and a closed set of kinds", () => {
    const config = getTableConfig(modelAliases);

    expect(config.name).toBe("model_aliases");
    expect(config.columns.map((entry) => entry.name)).toEqual(["id", "model_id", "alias", "kind"]);

    const id = column(config.columns, "id");
    expect(id.columnType).toBe("PgBigInt53");
    expect(id.primary).toBe(true);
    expect(id.generatedIdentity?.type).toBe("always");

    expect(column(config.columns, "model_id").notNull).toBe(true);

    const alias = column(config.columns, "alias");
    expect(alias.notNull).toBe(true);
    expect(alias.isUnique).toBe(true);

    const kind = column(config.columns, "kind");
    expect(kind.notNull).toBe(true);
    expect(kind.enumValues).toEqual([
      "latest_pointer",
      "dated_snapshot",
      "former_name",
      "aggregator_slug",
    ]);
    expect(modelAliasKind.enumName).toBe("model_alias_kind");
    expect(modelAliasKind.enumValues).toEqual(kind.enumValues);

    expect(config.foreignKeys).toHaveLength(1);
    const foreignKey = config.foreignKeys[0];
    expect(foreignKey).toBeDefined();
    const reference = foreignKey!.reference();
    expect(reference.columns.map((entry) => entry.name)).toEqual(["model_id"]);
    expect(getTableConfig(reference.foreignTable).name).toBe("models");
    expect(reference.foreignColumns.map((entry) => entry.name)).toEqual(["id"]);
    expect(foreignKey!.onDelete).toBe("restrict");
  });
});

describe("price tables", () => {
  it("defines an offering as one model on one platform and region", () => {
    const config = getTableConfig(offerings);

    expect(config.name).toBe("offerings");
    expect(config.columns.map((entry) => entry.name)).toEqual([
      "id",
      "model_id",
      "platform",
      "region",
    ]);

    const id = column(config.columns, "id");
    expect(id.columnType).toBe("PgBigInt53");
    expect(id.primary).toBe(true);
    expect(id.generatedIdentity?.type).toBe("always");

    expect(column(config.columns, "model_id").notNull).toBe(true);
    expect(column(config.columns, "platform").notNull).toBe(true);

    const region = column(config.columns, "region");
    expect(region.notNull).toBe(true);
    expect(region.default).toBe("global");

    expect(config.uniqueConstraints).toHaveLength(1);
    expect(config.uniqueConstraints[0]?.name).toBe("offerings_model_id_platform_region");
    expect(config.uniqueConstraints[0]?.columns.map((entry) => entry.name)).toEqual([
      "model_id",
      "platform",
      "region",
    ]);

    const foreignKey = foreignKeyTo(config, "model_id");
    const reference = foreignKey.reference();
    expect(getTableConfig(reference.foreignTable).name).toBe("models");
    expect(reference.foreignColumns.map((entry) => entry.name)).toEqual(["id"]);
    expect(foreignKey.onDelete).toBe("restrict");
  });

  it("defines a price version as a dated period, not a single number", () => {
    const config = getTableConfig(priceVersions);

    expect(config.name).toBe("price_versions");
    expect(config.columns.map((entry) => entry.name)).toEqual([
      "id",
      "offering_id",
      "first_seen_at",
      "announced_on",
      "last_seen_at",
      "retracted_at",
      "replaces_version_id",
    ]);

    const id = column(config.columns, "id");
    expect(id.columnType).toBe("PgBigInt53");
    expect(id.primary).toBe(true);
    expect(id.generatedIdentity?.type).toBe("always");

    expect(column(config.columns, "offering_id").notNull).toBe(true);

    const firstSeenAt = column(config.columns, "first_seen_at");
    expect(firstSeenAt.notNull).toBe(true);
    expect(firstSeenAt.getSQLType()).toBe("timestamp with time zone");

    const announcedOn = column(config.columns, "announced_on");
    expect(announcedOn.notNull).toBe(false);
    expect(announcedOn.getSQLType()).toBe("date");

    const lastSeenAt = column(config.columns, "last_seen_at");
    expect(lastSeenAt.notNull).toBe(false);
    expect(lastSeenAt.getSQLType()).toBe("timestamp with time zone");

    const retractedAt = column(config.columns, "retracted_at");
    expect(retractedAt.notNull).toBe(false);
    expect(retractedAt.getSQLType()).toBe("timestamp with time zone");

    expect(column(config.columns, "replaces_version_id").notNull).toBe(false);

    const offeringKey = foreignKeyTo(config, "offering_id");
    const offeringReference = offeringKey.reference();
    expect(getTableConfig(offeringReference.foreignTable).name).toBe("offerings");
    expect(offeringReference.foreignColumns.map((entry) => entry.name)).toEqual(["id"]);
    expect(offeringKey.onDelete).toBe("restrict");

    const replacesKey = foreignKeyTo(config, "replaces_version_id");
    const replacesReference = replacesKey.reference();
    expect(getTableConfig(replacesReference.foreignTable).name).toBe("price_versions");
    expect(replacesReference.foreignColumns.map((entry) => entry.name)).toEqual(["id"]);
    expect(replacesKey.onDelete).toBe("restrict");
  });

  it("stores each amount as its own row and refuses a second copy of the same tier", () => {
    const config = getTableConfig(priceComponents);

    expect(config.name).toBe("price_components");
    expect(config.columns.map((entry) => entry.name)).toEqual([
      "id",
      "price_version_id",
      "dimension",
      "unit",
      "amount",
      "condition",
    ]);

    const id = column(config.columns, "id");
    expect(id.columnType).toBe("PgBigInt53");
    expect(id.primary).toBe(true);
    expect(id.generatedIdentity?.type).toBe("always");

    const dimension = column(config.columns, "dimension");
    expect(dimension.notNull).toBe(true);
    expect(dimension.enumValues).toEqual([
      "input",
      "output",
      "cache_read",
      "cache_write_5m",
      "cache_write_1h",
      "cache_write",
    ]);
    expect(priceDimension.enumName).toBe("price_dimension");
    expect(priceDimension.enumValues).toEqual(dimension.enumValues);

    const unit = column(config.columns, "unit");
    expect(unit.notNull).toBe(true);
    expect(unit.enumValues).toEqual(["usd_per_1m_tokens"]);
    expect(priceUnit.enumName).toBe("price_unit");
    expect(priceUnit.enumValues).toEqual(unit.enumValues);

    const amount = column(config.columns, "amount");
    expect(amount.notNull).toBe(true);
    expect(amount.getSQLType()).toBe("numeric");
    expect(amount.columnType).toBe("PgNumeric");
    type ComponentRow = InferSelectModel<typeof priceComponents>;
    type AmountIsDecimalString = ComponentRow["amount"] extends string ? true : false;
    const amountIsDecimalString: AmountIsDecimalString = true;
    expect(amountIsDecimalString).toBe(true);

    const condition = column(config.columns, "condition");
    expect(condition.notNull).toBe(true);
    expect(condition.getSQLType()).toBe("jsonb");
    expect(condition.default).toEqual({});

    expect(config.uniqueConstraints).toHaveLength(1);
    expect(config.uniqueConstraints[0]?.name).toBe(
      "price_components_price_version_id_dimension_condition",
    );
    expect(config.uniqueConstraints[0]?.columns.map((entry) => entry.name)).toEqual([
      "price_version_id",
      "dimension",
      "condition",
    ]);

    const foreignKey = foreignKeyTo(config, "price_version_id");
    const reference = foreignKey.reference();
    expect(getTableConfig(reference.foreignTable).name).toBe("price_versions");
    expect(reference.foreignColumns.map((entry) => entry.name)).toEqual(["id"]);
    expect(foreignKey.onDelete).toBe("restrict");
  });
});

/**
 * Turn a Drizzle check expression into the words it will send to Postgres.
 * Column objects stay as their names. String pieces stay as written.
 */
function checkText(value: { queryChunks: readonly unknown[] }): string {
  return value.queryChunks
    .map((chunk) => {
      if (typeof chunk === "string") {
        return chunk;
      }
      if (
        chunk &&
        typeof chunk === "object" &&
        "value" in chunk &&
        Array.isArray(chunk.value) &&
        chunk.value.every((part) => typeof part === "string")
      ) {
        return chunk.value.join("");
      }
      if (chunk && typeof chunk === "object" && "name" in chunk && typeof chunk.name === "string") {
        return chunk.name;
      }
      return "";
    })
    .join("");
}

describe("evidence tables", () => {
  it("defines a source as one page, with a closed set of types", () => {
    const config = getTableConfig(sources);

    expect(config.name).toBe("sources");
    expect(config.columns.map((entry) => entry.name)).toEqual([
      "id",
      "url",
      "type",
      "active",
      "last_checked_at",
    ]);
    expect(config.foreignKeys).toEqual([]);

    const id = column(config.columns, "id");
    expect(id.columnType).toBe("PgBigInt53");
    expect(id.primary).toBe(true);
    expect(id.generatedIdentity?.type).toBe("always");

    const url = column(config.columns, "url");
    expect(url.notNull).toBe(true);
    expect(url.isUnique).toBe(true);

    const type = column(config.columns, "type");
    expect(type.notNull).toBe(true);
    expect(type.enumValues).toEqual([
      "official",
      "wayback",
      "aggregator",
      "announcement",
      "changelog_feed",
      "platform_api",
    ]);
    expect(sourceType.enumName).toBe("source_type");
    expect(sourceType.enumValues).toEqual(type.enumValues);

    const active = column(config.columns, "active");
    expect(active.notNull).toBe(true);
    expect(active.getSQLType()).toBe("boolean");
    expect(active.default).toBe(true);

    const lastCheckedAt = column(config.columns, "last_checked_at");
    expect(lastCheckedAt.notNull).toBe(false);
    expect(lastCheckedAt.getSQLType()).toBe("timestamp with time zone");
  });

  it("defines an observation as one changed fetch of one source", () => {
    const config = getTableConfig(observations);

    expect(config.name).toBe("observations");
    expect(config.columns.map((entry) => entry.name)).toEqual([
      "id",
      "source_id",
      "fetched_at",
      "content_hash",
      "raw_content",
      "raw_content_hash",
      "parsed_data",
      "archive_url",
      "archive_status",
    ]);

    const id = column(config.columns, "id");
    expect(id.columnType).toBe("PgBigInt53");
    expect(id.primary).toBe(true);
    expect(id.generatedIdentity?.type).toBe("always");

    expect(column(config.columns, "source_id").notNull).toBe(true);

    const fetchedAt = column(config.columns, "fetched_at");
    expect(fetchedAt.notNull).toBe(true);
    expect(fetchedAt.getSQLType()).toBe("timestamp with time zone");

    for (const name of ["content_hash", "raw_content", "raw_content_hash"] as const) {
      expect(column(config.columns, name).notNull).toBe(true);
    }

    const parsedData = column(config.columns, "parsed_data");
    expect(parsedData.notNull).toBe(true);
    expect(parsedData.getSQLType()).toBe("jsonb");

    expect(column(config.columns, "archive_url").notNull).toBe(false);

    const archive = column(config.columns, "archive_status");
    expect(archive.notNull).toBe(true);
    expect(archive.default).toBe("pending");
    expect(archive.enumValues).toEqual(["pending", "archived", "failed"]);
    expect(archiveStatus.enumName).toBe("archive_status");
    expect(archiveStatus.enumValues).toEqual(archive.enumValues);

    const foreignKey = foreignKeyTo(config, "source_id");
    const reference = foreignKey.reference();
    expect(getTableConfig(reference.foreignTable).name).toBe("sources");
    expect(reference.foreignColumns.map((entry) => entry.name)).toEqual(["id"]);
    expect(foreignKey.onDelete).toBe("restrict");
  });

  it("defines one observation item per tracked offering, and defaults review to flagged", () => {
    const config = getTableConfig(observationItems);

    expect(config.name).toBe("observation_items");
    expect(config.columns.map((entry) => entry.name)).toEqual([
      "id",
      "observation_id",
      "offering_id",
      "grounding_result",
      "review_status",
      "reviewed_by",
      "reviewed_at",
      "review_note",
    ]);

    const id = column(config.columns, "id");
    expect(id.columnType).toBe("PgBigInt53");
    expect(id.primary).toBe(true);
    expect(id.generatedIdentity?.type).toBe("always");

    expect(column(config.columns, "observation_id").notNull).toBe(true);
    expect(column(config.columns, "offering_id").notNull).toBe(true);

    const groundingResult = column(config.columns, "grounding_result");
    expect(groundingResult.notNull).toBe(false);
    expect(groundingResult.getSQLType()).toBe("jsonb");

    const status = column(config.columns, "review_status");
    expect(status.notNull).toBe(true);
    expect(status.default).toBe("flagged");
    expect(status.enumValues).toEqual(["ok", "flagged", "confirmed", "rejected"]);
    expect(reviewStatus.enumName).toBe("review_status");
    expect(reviewStatus.enumValues).toEqual(status.enumValues);

    expect(column(config.columns, "reviewed_by").notNull).toBe(false);
    const reviewedAt = column(config.columns, "reviewed_at");
    expect(reviewedAt.notNull).toBe(false);
    expect(reviewedAt.getSQLType()).toBe("timestamp with time zone");
    expect(column(config.columns, "review_note").notNull).toBe(false);

    expect(config.uniqueConstraints).toHaveLength(1);
    expect(config.uniqueConstraints[0]?.name).toBe(
      "observation_items_observation_id_offering_id",
    );
    expect(config.uniqueConstraints[0]?.columns.map((entry) => entry.name)).toEqual([
      "observation_id",
      "offering_id",
    ]);

    const observationKey = foreignKeyTo(config, "observation_id");
    const observationReference = observationKey.reference();
    expect(getTableConfig(observationReference.foreignTable).name).toBe("observations");
    expect(observationReference.foreignColumns.map((entry) => entry.name)).toEqual(["id"]);
    expect(observationKey.onDelete).toBe("restrict");

    const offeringKey = foreignKeyTo(config, "offering_id");
    const offeringReference = offeringKey.reference();
    expect(getTableConfig(offeringReference.foreignTable).name).toBe("offerings");
    expect(offeringReference.foreignColumns.map((entry) => entry.name)).toEqual(["id"]);
    expect(offeringKey.onDelete).toBe("restrict");
  });

  it("requires an observation only when the fetch outcome is changed", () => {
    const config = getTableConfig(fetchLog);

    expect(config.name).toBe("fetch_log");
    expect(config.columns.map((entry) => entry.name)).toEqual([
      "id",
      "source_id",
      "fetched_at",
      "http_status",
      "outcome",
      "observation_id",
      "note",
    ]);

    const id = column(config.columns, "id");
    expect(id.columnType).toBe("PgBigInt53");
    expect(id.primary).toBe(true);
    expect(id.generatedIdentity?.type).toBe("always");

    expect(column(config.columns, "source_id").notNull).toBe(true);

    const fetchedAt = column(config.columns, "fetched_at");
    expect(fetchedAt.notNull).toBe(true);
    expect(fetchedAt.getSQLType()).toBe("timestamp with time zone");

    const httpStatus = column(config.columns, "http_status");
    expect(httpStatus.notNull).toBe(false);
    expect(httpStatus.getSQLType()).toBe("integer");

    const outcome = column(config.columns, "outcome");
    expect(outcome.notNull).toBe(true);
    expect(outcome.enumValues).toEqual(["unchanged", "changed", "parser_suspect", "fetch_error"]);
    expect(fetchOutcome.enumName).toBe("fetch_outcome");
    expect(fetchOutcome.enumValues).toEqual(outcome.enumValues);

    expect(column(config.columns, "observation_id").notNull).toBe(false);
    expect(column(config.columns, "note").notNull).toBe(false);

    const sourceKey = foreignKeyTo(config, "source_id");
    const sourceReference = sourceKey.reference();
    expect(getTableConfig(sourceReference.foreignTable).name).toBe("sources");
    expect(sourceReference.foreignColumns.map((entry) => entry.name)).toEqual(["id"]);
    expect(sourceKey.onDelete).toBe("restrict");

    const observationKey = foreignKeyTo(config, "observation_id");
    const observationReference = observationKey.reference();
    expect(getTableConfig(observationReference.foreignTable).name).toBe("observations");
    expect(observationReference.foreignColumns.map((entry) => entry.name)).toEqual(["id"]);
    expect(observationKey.onDelete).toBe("restrict");

    expect(config.uniqueConstraints).toHaveLength(1);
    expect(config.uniqueConstraints[0]?.name).toBe("fetch_log_observation_id");
    expect(config.uniqueConstraints[0]?.columns.map((entry) => entry.name)).toEqual([
      "observation_id",
    ]);

    expect(config.checks).toHaveLength(1);
    const linkCheck = config.checks[0];
    expect(linkCheck).toBeDefined();
    expect(linkCheck!.name).toBe("fetch_log_observation_matches_outcome");
    const text = checkText(linkCheck!.value).replace(/\s+/g, " ");
    expect(text).toContain("outcome = 'changed'");
    expect(text).toContain("observation_id IS NOT NULL");
    expect(text).toContain("outcome <> 'changed'");
    expect(text).toContain("observation_id IS NULL");
  });
});
