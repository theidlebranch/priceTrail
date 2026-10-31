// @vitest-environment node

/**
 * These tests talk to Neon. They skip when DATABASE_URL is missing, which
 * is what CI does. Each database test rolls its transaction back, so a
 * passing run leaves no rows.
 *
 * Drizzle wraps the driver error. sqlState follows `cause` until it finds
 * the Postgres SQLSTATE. 23505 is a unique violation. 23503 is a foreign key.
 *
 * Local run:
 * node --env-file=.env ./node_modules/vitest/vitest.mjs run src/server/db/repositories/catalog.test.ts
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { createDb } from "@/server/db/client";
import {
  createCatalogRepository,
  requireInsertedRow,
  type CatalogRepository,
} from "@/server/db/repositories/catalog";
import { parseDatabaseEnv } from "@/server/env";

const databaseUrl = process.env.DATABASE_URL?.trim() ?? "";

describe("requireInsertedRow", () => {
  it("throws when an insert returns no row", () => {
    expect(() => requireInsertedRow([], "insertLab")).toThrow(/insertLab returned no row/);
  });

  it("returns the row an insert produced", () => {
    expect(requireInsertedRow([{ id: 1 }], "insertLab")).toEqual({ id: 1 });
  });
});

describe.skipIf(databaseUrl.length === 0)("catalog repository", () => {
  let close: (() => Promise<void>) | undefined;
  let db: ReturnType<typeof createDb>["db"];

  beforeAll(() => {
    const parsed = parseDatabaseEnv({ DATABASE_URL: databaseUrl });
    const opened = createDb(parsed.databaseUrl);
    db = opened.db;
    close = () => opened.close();
  });

  afterAll(async () => {
    await close?.();
  });

  it("inserts a lab and reads it back by slug", async () => {
    await withCatalog(async (catalog) => {
      const slug = uniqueSlug("lab");
      const inserted = await catalog.insertLab({ name: "Anthropic", slug });

      expect(inserted.id).toEqual(expect.any(Number));
      expect(inserted).toMatchObject({ name: "Anthropic", slug });
      expect(await catalog.findLabBySlug(slug)).toEqual(inserted);
    });
  });

  it("returns null when the lab slug is missing", async () => {
    await withCatalog(async (catalog) => {
      expect(await catalog.findLabBySlug(uniqueSlug("missing"))).toBeNull();
    });
  });

  it("throws 23505 when a lab slug is reused", async () => {
    await withCatalog(async (catalog) => {
      const slug = uniqueSlug("lab");
      await catalog.insertLab({ name: "Anthropic", slug });
      await expectSqlState(() => catalog.insertLab({ name: "Other", slug }), "23505");
    });
  });

  it("inserts a model and reads it back by lab and slug", async () => {
    await withCatalog(async (catalog) => {
      const lab = await catalog.insertLab({ name: "Anthropic", slug: uniqueSlug("lab") });
      const slug = uniqueSlug("model");
      const inserted = await catalog.insertModel({
        labId: lab.id,
        name: "Claude Haiku 4.5",
        slug,
      });

      expect(inserted.deprecatedAt).toBeNull();
      expect(await catalog.findModelByLabAndSlug(lab.id, slug)).toEqual(inserted);
    });
  });

  it("throws 23503 when a model points at a missing lab", async () => {
    await withCatalog(async (catalog) => {
      await expectSqlState(
        () =>
          catalog.insertModel({
            labId: missingId,
            name: "Missing",
            slug: uniqueSlug("model"),
          }),
        "23503",
      );
    });
  });

  it("throws 23505 when a model slug is reused for one lab", async () => {
    await withCatalog(async (catalog) => {
      const lab = await catalog.insertLab({ name: "Anthropic", slug: uniqueSlug("lab") });
      const slug = uniqueSlug("model");
      await catalog.insertModel({ labId: lab.id, name: "Claude Haiku 4.5", slug });
      await expectSqlState(
        () => catalog.insertModel({ labId: lab.id, name: "Again", slug }),
        "23505",
      );
    });
  });

  it("inserts an alias and reads it back", async () => {
    await withCatalog(async (catalog) => {
      const lab = await catalog.insertLab({ name: "Anthropic", slug: uniqueSlug("lab") });
      const model = await catalog.insertModel({
        labId: lab.id,
        name: "Claude Haiku 4.5",
        slug: uniqueSlug("model"),
      });
      const alias = uniqueSlug("alias");
      const inserted = await catalog.insertModelAlias({
        modelId: model.id,
        alias,
        kind: "aggregator_slug",
      });

      expect(await catalog.findModelAlias(alias)).toEqual(inserted);
    });
  });

  it("throws 23505 when an alias is reused", async () => {
    await withCatalog(async (catalog) => {
      const lab = await catalog.insertLab({ name: "Anthropic", slug: uniqueSlug("lab") });
      const model = await catalog.insertModel({
        labId: lab.id,
        name: "Claude Haiku 4.5",
        slug: uniqueSlug("model"),
      });
      const alias = uniqueSlug("alias");
      await catalog.insertModelAlias({ modelId: model.id, alias, kind: "aggregator_slug" });
      await expectSqlState(
        () =>
          catalog.insertModelAlias({
            modelId: model.id,
            alias,
            kind: "latest_pointer",
          }),
        "23505",
      );
    });
  });

  it("throws 23503 when an alias points at a missing model", async () => {
    await withCatalog(async (catalog) => {
      await expectSqlState(
        () =>
          catalog.insertModelAlias({
            modelId: missingId,
            alias: uniqueSlug("alias"),
            kind: "former_name",
          }),
        "23503",
      );
    });
  });

  it("stores global when an offering omits region, and reads that row back", async () => {
    await withCatalog(async (catalog) => {
      const lab = await catalog.insertLab({ name: "Anthropic", slug: uniqueSlug("lab") });
      const model = await catalog.insertModel({
        labId: lab.id,
        name: "Claude Haiku 4.5",
        slug: uniqueSlug("model"),
      });
      const inserted = await catalog.insertOffering({
        modelId: model.id,
        platform: "anthropic",
      });

      expect(inserted.region).toBe("global");
      expect(await catalog.findOffering(model.id, "anthropic", "global")).toEqual(inserted);
    });
  });

  it("throws 23505 when an offering is stored twice", async () => {
    await withCatalog(async (catalog) => {
      const lab = await catalog.insertLab({ name: "Anthropic", slug: uniqueSlug("lab") });
      const model = await catalog.insertModel({
        labId: lab.id,
        name: "Claude Haiku 4.5",
        slug: uniqueSlug("model"),
      });
      await catalog.insertOffering({ modelId: model.id, platform: "anthropic" });
      await expectSqlState(
        () => catalog.insertOffering({ modelId: model.id, platform: "anthropic" }),
        "23505",
      );
    });
  });

  it("lists models with their lab, lab name first then model name", async () => {
    await withCatalog(async (catalog) => {
      const laterLab = await catalog.insertLab({
        name: "Zulu List Lab",
        slug: uniqueSlug("lab"),
      });
      const earlierLab = await catalog.insertLab({
        name: "Alpha List Lab",
        slug: uniqueSlug("lab"),
      });
      const laterModel = await catalog.insertModel({
        labId: laterLab.id,
        name: "Zulu Model",
        slug: uniqueSlug("model"),
      });
      const earlierModel = await catalog.insertModel({
        labId: earlierLab.id,
        name: "Alpha Model",
        slug: uniqueSlug("model"),
      });

      const listed = await catalog.listModels();
      const ours = listed.filter(
        (item) => item.slug === earlierModel.slug || item.slug === laterModel.slug,
      );

      expect(ours).toEqual([
        {
          labName: "Alpha List Lab",
          labSlug: earlierLab.slug,
          name: "Alpha Model",
          slug: earlierModel.slug,
          deprecatedAt: null,
        },
        {
          labName: "Zulu List Lab",
          labSlug: laterLab.slug,
          name: "Zulu Model",
          slug: laterModel.slug,
          deprecatedAt: null,
        },
      ]);
    });
  });

  it("throws 23503 when an offering points at a missing model", async () => {
    await withCatalog(async (catalog) => {
      await expectSqlState(
        () => catalog.insertOffering({ modelId: missingId, platform: "anthropic" }),
        "23503",
      );
    });
  });

  async function withCatalog(run: (catalog: CatalogRepository) => Promise<void>): Promise<void> {
    try {
      await db.transaction(async (tx) => {
        await run(createCatalogRepository(tx));
        throw new RolledBack();
      });
    } catch (error) {
      if (error instanceof RolledBack) {
        return;
      }
      throw error;
    }
  }
});

/**
 * A real lab id will not reach this. Identity starts at 1.
 * Using it on purpose makes the foreign key fail.
 */
const missingId = Number.MAX_SAFE_INTEGER;

class RolledBack extends Error {
  constructor() {
    super("catalog test rolled back");
    this.name = "RolledBack";
  }
}

function uniqueSlug(prefix: string): string {
  return `${prefix}-${randomUUID()}`;
}

function sqlState(error: unknown): string | undefined {
  if (error instanceof postgres.PostgresError) {
    return error.code;
  }
  if (error instanceof Error && "cause" in error) {
    return sqlState(error.cause);
  }
  return undefined;
}

async function expectSqlState(run: () => Promise<unknown>, code: string): Promise<void> {
  try {
    await run();
  } catch (error) {
    expect(sqlState(error)).toBe(code);
    return;
  }
  expect.fail(`expected SQLSTATE ${code}`);
}
