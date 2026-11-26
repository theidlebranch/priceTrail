// @vitest-environment node

/**
 * A blank note throws before any query. The writes talk to Neon and skip
 * when DATABASE_URL is missing. Each database test rolls its transaction
 * back, so a passing run leaves no rows.
 *
 * Local run:
 * node --env-file=.env ./node_modules/vitest/vitest.mjs run src/server/review/publish-new-official-model.test.ts
 */
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb } from "@/server/db/client";
import { type PublishDb } from "@/server/db/publish-price-version";
import { createCatalogRepository, requireInsertedRow } from "@/server/db/repositories/catalog";
import {
  candidateModels,
  models,
  observationItems,
  observations,
  offerings,
  priceComponents,
  priceVersions,
  sources,
} from "@/server/db/schema";
import { parseDatabaseEnv } from "@/server/env";
import { publishNewOfficialModel } from "@/server/review/publish-new-official-model";

const databaseUrl = process.env.DATABASE_URL?.trim() ?? "";
const FETCHED_AT = new Date("2026-11-01T00:00:00.000Z");
const REVIEWED_AT = new Date("2026-11-06T19:00:00.000Z");

describe("publishNewOfficialModel input checks", () => {
  it("throws when the note is blank and does not open a transaction", async () => {
    await expect(
      publishNewOfficialModel(untouchedDb(), {
        candidateId: 1,
        note: "   ",
        reviewedBy: "google:reviewer1",
        reviewedAt: REVIEWED_AT,
      }),
    ).rejects.toThrow(/review note is empty/);
  });
});

describe.skipIf(databaseUrl.length === 0)("publishNewOfficialModel", () => {
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

  it("refuses to publish a retirement card and leaves it pending", async () => {
    await withPublish(async (tx) => {
      const planted = await plantCandidate(tx, {
        kind: "retirement",
        rows: [priceRow("claude-haiku-4.5", "Claude Haiku 4.5", "1")],
      });

      await expect(publishNewOfficialModel(tx, decision(planted.candidateId))).rejects.toThrow(
        /use accept/,
      );
      const card = await tx
        .select({ status: candidateModels.status })
        .from(candidateModels)
        .where(eq(candidateModels.id, planted.candidateId));
      expect(card[0]?.status).toBe("pending_review");
      expect(await tx.select({ id: models.id }).from(models).where(eq(models.labId, planted.labId))).toEqual(
        [],
      );
    });
  });

  it("adds the model and publishes the price from the latest snapshot", async () => {
    await withPublish(async (tx) => {
      const planted = await plantCandidate(tx, {
        rows: [priceRow("claude-haiku-4.5", "Claude Haiku 4.5", "1")],
      });

      const result = await publishNewOfficialModel(tx, decision(planted.candidateId));

      const model = await tx
        .select()
        .from(models)
        .where(eq(models.id, result.modelId));
      expect(model).toEqual([
        expect.objectContaining({
          labId: planted.labId,
          name: "Claude Haiku 4.5",
          slug: "claude-haiku-4.5",
        }),
      ]);
      const offering = await tx
        .select()
        .from(offerings)
        .where(eq(offerings.modelId, result.modelId));
      expect(offering).toEqual([
        expect.objectContaining({ platform: "official-api", region: "global" }),
      ]);
      const item = await tx
        .select()
        .from(observationItems)
        .where(eq(observationItems.offeringId, offering[0]?.id ?? 0));
      expect(item).toEqual([
        expect.objectContaining({
          observationId: planted.observationId,
          reviewStatus: "confirmed",
          reviewedBy: "google:reviewer1",
          reviewNote: "Checked the table.",
        }),
      ]);
      const versions = await tx
        .select()
        .from(priceVersions)
        .where(eq(priceVersions.offeringId, offering[0]?.id ?? 0));
      expect(versions).toEqual([
        expect.objectContaining({
          id: result.priceVersionId,
          firstSeenAt: FETCHED_AT,
          announcedOn: null,
          lastSeenAt: null,
        }),
      ]);
      const amounts = await tx
        .select({ amount: priceComponents.amount, dimension: priceComponents.dimension })
        .from(priceComponents)
        .where(eq(priceComponents.priceVersionId, result.priceVersionId));
      expect(amounts).toEqual([{ amount: "1", dimension: "input" }]);
      const card = await tx
        .select()
        .from(candidateModels)
        .where(eq(candidateModels.id, planted.candidateId));
      expect(card[0]).toMatchObject({
        status: "approved",
        resolvedModelId: result.modelId,
        reviewedBy: "google:reviewer1",
        reviewNote: "Checked the table.",
      });
    });
  });

  it("leaves the card pending when no price applies on the review day", async () => {
    await withPublish(async (tx) => {
      const planted = await plantCandidate(tx, {
        rows: [
          priceRow("claude-haiku-4.5", "Claude Haiku 4.5", "1", { validFrom: "2026-12-01" }),
        ],
      });

      await expect(publishNewOfficialModel(tx, decision(planted.candidateId))).rejects.toThrow(
        /no price for claude-haiku-4.5 applies on 2026-11-06/,
      );

      expect(await modelsFor(tx, planted.labId)).toEqual([]);
      expect(await cardStatus(tx, planted.candidateId)).toBe("pending_review");
    });
  });

  it("leaves the card pending when the latest snapshot no longer has the slug", async () => {
    await withPublish(async (tx) => {
      const planted = await plantCandidate(tx, {
        rows: [priceRow("claude-other", "Claude Other", "2")],
      });

      await expect(publishNewOfficialModel(tx, decision(planted.candidateId))).rejects.toThrow(
        /no rows for claude-haiku-4.5/,
      );

      expect(await modelsFor(tx, planted.labId)).toEqual([]);
      expect(await cardStatus(tx, planted.candidateId)).toBe("pending_review");
    });
  });

  it("refuses a card whose source is not an official page", async () => {
    await withPublish(async (tx) => {
      const planted = await plantCandidate(tx, {
        sourceType: "aggregator",
        rows: [priceRow("claude-haiku-4.5", "Claude Haiku 4.5", "1")],
      });

      await expect(publishNewOfficialModel(tx, decision(planted.candidateId))).rejects.toThrow(
        /official/,
      );
      expect(await modelsFor(tx, planted.labId)).toEqual([]);
      expect(await cardStatus(tx, planted.candidateId)).toBe("pending_review");
    });
  });

  async function withPublish(run: (tx: PublishDb) => Promise<void>): Promise<void> {
    try {
      await db.transaction(async (tx) => {
        await run(tx);
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

class RolledBack extends Error {
  constructor() {
    super("publish new model test rolled back");
    this.name = "RolledBack";
  }
}

function untouchedDb(): PublishDb {
  return {
    transaction: () => {
      throw new Error("publishNewOfficialModel touched the database");
    },
  } as unknown as PublishDb;
}

function decision(candidateId: number) {
  return {
    candidateId,
    note: "Checked the table.",
    reviewedBy: "google:reviewer1",
    reviewedAt: REVIEWED_AT,
  };
}

function priceRow(
  modelSlug: string,
  modelName: string,
  usdPer1M: string,
  extra: { validFrom?: string } = {},
) {
  return {
    provider: "anthropic",
    modelName,
    modelSlug,
    dimension: "input",
    usdPer1M,
    source: "official",
    ...extra,
  };
}

async function plantCandidate(
  tx: PublishDb,
  input: {
    rows: ReturnType<typeof priceRow>[];
    sourceType?: "official" | "aggregator";
    kind?: "new_name" | "retirement" | "gone";
  },
) {
  const catalog = createCatalogRepository(tx);
  const lab = await catalog.insertLab({ name: "Anthropic", slug: uniqueSlug("lab") });
  const source = requireInsertedRow(
    await tx
      .insert(sources)
      .values({
        url: `https://example.test/new-model/${randomUUID()}`,
        type: input.sourceType ?? "official",
      })
      .returning({ id: sources.id }),
    "insert source",
  );
  const observation = requireInsertedRow(
    await tx
      .insert(observations)
      .values({
        sourceId: source.id,
        fetchedAt: FETCHED_AT,
        contentHash: uniqueSlug("content"),
        rawContent: uniqueSlug("raw"),
        rawContentHash: uniqueSlug("raw-hash"),
        parsedData: { rows: input.rows, warnings: [] },
      })
      .returning({ id: observations.id }),
    "insert observation",
  );
  const card = requireInsertedRow(
    await tx
      .insert(candidateModels)
      .values({
        labId: lab.id,
        rawName: "Claude Haiku 4.5",
        rawSlug: "claude-haiku-4.5",
        sourceId: source.id,
        firstSeenAt: FETCHED_AT,
        kind: input.kind ?? "new_name",
        hint: input.kind === "new_name" || input.kind === undefined ? null : "retired",
      })
      .returning({ id: candidateModels.id }),
    "insert candidate",
  );
  return { labId: lab.id, candidateId: card.id, observationId: observation.id };
}

async function modelsFor(tx: PublishDb, labId: number) {
  return tx.select({ id: models.id }).from(models).where(eq(models.labId, labId));
}

async function cardStatus(tx: PublishDb, candidateId: number) {
  const rows = await tx
    .select({ status: candidateModels.status })
    .from(candidateModels)
    .where(eq(candidateModels.id, candidateId));
  return rows[0]?.status;
}

function uniqueSlug(prefix: string): string {
  return `${prefix}-${randomUUID()}`;
}
