import type { InferSelectModel } from "drizzle-orm";
import { getTableConfig, type PgColumn } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import {
  labs,
  modelAliasKind,
  modelAliases,
  models,
  offerings,
  priceComponents,
  priceDimension,
  priceUnit,
  priceVersions,
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
