import { getTableConfig, type PgColumn } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { modelAliasKind, modelAliases, models, providers } from "@/server/db/schema";

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

describe("identity tables", () => {
  it("defines providers with a required unique slug and an identity id", () => {
    const config = getTableConfig(providers);

    expect(config.name).toBe("providers");
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

  it("defines models with one slug per provider and an optional deprecation time", () => {
    const config = getTableConfig(models);

    expect(config.name).toBe("models");
    expect(config.columns.map((entry) => entry.name)).toEqual([
      "id",
      "provider_id",
      "name",
      "slug",
      "deprecated_at",
    ]);

    const id = column(config.columns, "id");
    expect(id.columnType).toBe("PgBigInt53");
    expect(id.primary).toBe(true);
    expect(id.generatedIdentity?.type).toBe("always");

    const providerId = column(config.columns, "provider_id");
    expect(providerId.notNull).toBe(true);
    expect(providerId.columnType).toBe("PgBigInt53");

    expect(column(config.columns, "name").notNull).toBe(true);
    expect(column(config.columns, "slug").notNull).toBe(true);
    expect(column(config.columns, "slug").isUnique).toBe(false);

    const deprecatedAt = column(config.columns, "deprecated_at");
    expect(deprecatedAt.notNull).toBe(false);
    expect(deprecatedAt.getSQLType()).toBe("timestamp with time zone");

    expect(config.uniqueConstraints).toHaveLength(1);
    expect(config.uniqueConstraints[0]?.columns.map((entry) => entry.name)).toEqual([
      "provider_id",
      "slug",
    ]);

    expect(config.foreignKeys).toHaveLength(1);
    const foreignKey = config.foreignKeys[0];
    expect(foreignKey).toBeDefined();
    const reference = foreignKey!.reference();
    expect(reference.columns.map((entry) => entry.name)).toEqual(["provider_id"]);
    expect(getTableConfig(reference.foreignTable).name).toBe("providers");
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
