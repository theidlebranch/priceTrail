import {
  and,
  asc,
  eq,
  type ExtractTablesWithRelations,
  type InferInsertModel,
  type InferSelectModel,
} from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import type { PostgresJsDatabase, PostgresJsQueryResultHKT } from "drizzle-orm/postgres-js";
import * as schema from "@/server/db/schema";
import { labs, modelAliases, models, offerings } from "@/server/db/schema";

/**
 * Catalog door: labs, models, aliases, and offerings.
 *
 * A repository is the storage door for one job. Callers ask insertLab,
 * findModelByLabAndSlug, or listModels. The SQL stays in this file.
 *
 * This file only loads and saves catalog rows. It does not parse a page,
 * set review_status, or open a price period. A new job gets a new file.
 * It does not grow this one. Nothing under repositories/ inserts into
 * price_versions or price_components. publishPriceVersion() is that writer.
 * It lives in src/server/db/publish-price-version.ts.
 *
 * A missing row is null. A duplicate or a broken foreign key throws. Those
 * errors come from Postgres (23505 and 23503). This file does not catch
 * them and turn them into null.
 */

type Schema = typeof schema;

/**
 * The normal client, or a transaction opened around several catalog writes.
 * A transaction is a different class with the same insert and select methods.
 */
type CatalogDb =
  | PostgresJsDatabase<Schema>
  | PgTransaction<PostgresJsQueryResultHKT, Schema, ExtractTablesWithRelations<Schema>>;

type LabRow = InferSelectModel<typeof labs>;
type ModelRow = InferSelectModel<typeof models>;
type ModelAliasRow = InferSelectModel<typeof modelAliases>;
type OfferingRow = InferSelectModel<typeof offerings>;
type ModelAliasKind = InferInsertModel<typeof modelAliases>["kind"];

/**
 * One tracked model plus the lab that released it.
 * deprecatedAt stays null until the model is retired.
 */
export type ListedModel = {
  labName: string;
  labSlug: string;
  name: string;
  slug: string;
  deprecatedAt: Date | null;
};

export type CatalogRepository = {
  insertLab(input: { name: string; slug: string }): Promise<LabRow>;
  findLabBySlug(slug: string): Promise<LabRow | null>;
  insertModel(input: { labId: number; name: string; slug: string }): Promise<ModelRow>;
  findModelByLabAndSlug(labId: number, slug: string): Promise<ModelRow | null>;
  insertModelAlias(input: {
    modelId: number;
    alias: string;
    kind: ModelAliasKind;
  }): Promise<ModelAliasRow>;
  findModelAlias(alias: string): Promise<ModelAliasRow | null>;
  insertOffering(input: {
    modelId: number;
    platform: string;
    region?: string;
  }): Promise<OfferingRow>;
  findOffering(modelId: number, platform: string, region: string): Promise<OfferingRow | null>;
  listModels(): Promise<ListedModel[]>;
};

/**
 * An insert that comes back empty did not save the row. Returning undefined
 * would look like success to the caller.
 */
export function requireInsertedRow<T>(rows: T[], action: string): T {
  const row = rows[0];
  if (row === undefined) {
    throw new Error(`${action} returned no row`);
  }
  return row;
}

export function createCatalogRepository(db: CatalogDb): CatalogRepository {
  return {
    async insertLab(input) {
      const rows = await db.insert(labs).values(input).returning();
      return requireInsertedRow(rows, "insertLab");
    },

    async findLabBySlug(slug) {
      const rows = await db.select().from(labs).where(eq(labs.slug, slug)).limit(1);
      return rows[0] ?? null;
    },

    async insertModel(input) {
      const rows = await db.insert(models).values(input).returning();
      return requireInsertedRow(rows, "insertModel");
    },

    async findModelByLabAndSlug(labId, slug) {
      const rows = await db
        .select()
        .from(models)
        .where(and(eq(models.labId, labId), eq(models.slug, slug)))
        .limit(1);
      return rows[0] ?? null;
    },

    async insertModelAlias(input) {
      const rows = await db.insert(modelAliases).values(input).returning();
      return requireInsertedRow(rows, "insertModelAlias");
    },

    async findModelAlias(alias) {
      const rows = await db
        .select()
        .from(modelAliases)
        .where(eq(modelAliases.alias, alias))
        .limit(1);
      return rows[0] ?? null;
    },

    async insertOffering(input) {
      const rows = await db
        .insert(offerings)
        .values(
          input.region === undefined
            ? { modelId: input.modelId, platform: input.platform }
            : input,
        )
        .returning();
      return requireInsertedRow(rows, "insertOffering");
    },

    async findOffering(modelId, platform, region) {
      const rows = await db
        .select()
        .from(offerings)
        .where(
          and(
            eq(offerings.modelId, modelId),
            eq(offerings.platform, platform),
            eq(offerings.region, region),
          ),
        )
        .limit(1);
      return rows[0] ?? null;
    },

    async listModels() {
      return db
        .select({
          labName: labs.name,
          labSlug: labs.slug,
          name: models.name,
          slug: models.slug,
          deprecatedAt: models.deprecatedAt,
        })
        .from(models)
        .innerJoin(labs, eq(models.labId, labs.id))
        .orderBy(asc(labs.name), asc(models.name));
    },
  };
}
