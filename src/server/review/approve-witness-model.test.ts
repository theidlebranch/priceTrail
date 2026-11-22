// @vitest-environment node

/**
 * A blank note throws before any query. The writes talk to Neon and skip
 * when DATABASE_URL is missing. Each database test rolls its transaction
 * back, so a passing run leaves no rows.
 *
 * Local run:
 * node --env-file=.env ./node_modules/vitest/vitest.mjs run src/server/review/approve-witness-model.test.ts
 */
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb } from "@/server/db/client";
import { createCatalogRepository, requireInsertedRow } from "@/server/db/repositories/catalog";
import {
  candidateModels,
  modelAliases,
  models,
  observationItems,
  offerings,
  priceVersions,
  sources,
  sourceType,
} from "@/server/db/schema";
import { parseDatabaseEnv } from "@/server/env";
import type { SignalDb } from "@/server/pipeline/read-litellm-signal";
import { approveWitnessModel } from "@/server/review/approve-witness-model";
import { LITELLM_COST_MAP_URL } from "@/server/sources/litellm-signal";
import { OPENROUTER_MODELS_URL } from "@/server/sources/openrouter-signal";

const databaseUrl = process.env.DATABASE_URL?.trim() ?? "";
const SEEN_AT = new Date("2026-11-13T16:30:00.000Z");
const REVIEWED_AT = new Date("2026-11-14T12:00:00.000Z");

describe("approveWitnessModel input checks", () => {
  it("throws when the note is blank and does not open a transaction", async () => {
    await expect(
      approveWitnessModel(untouchedDb(), {
        candidateId: 1,
        note: "   ",
        reviewedBy: "google:reviewer1",
        reviewedAt: REVIEWED_AT,
      }),
    ).rejects.toThrow(/review note is empty/);
  });

  it("throws when the candidate id is not a whole number", async () => {
    await expect(
      approveWitnessModel(untouchedDb(), {
        candidateId: 0,
        note: "Add it.",
        reviewedBy: "google:reviewer1",
        reviewedAt: REVIEWED_AT,
      }),
    ).rejects.toThrow(/candidate id must be a whole number/);
  });

  it("throws when the reviewer id is not a login id", async () => {
    await expect(
      approveWitnessModel(untouchedDb(), {
        candidateId: 1,
        note: "Add it.",
        reviewedBy: "not-a-reviewer",
        reviewedAt: REVIEWED_AT,
      }),
    ).rejects.toThrow(/reviewed_by is not a reviewer id/);
  });

  it("throws when the review time is not a real date", async () => {
    await expect(
      approveWitnessModel(untouchedDb(), {
        candidateId: 1,
        note: "Add it.",
        reviewedBy: "google:reviewer1",
        reviewedAt: new Date("not-a-date"),
      }),
    ).rejects.toThrow(/reviewedAt must be a valid date/);
  });
});

describe.skipIf(databaseUrl.length === 0)("approveWitnessModel", () => {
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

  it("adds the model, the offering, and the alias, and writes no price", async () => {
    await withRollback(async (tx) => {
      const slug = uniqueSlug("witness");
      const planted = await plantCard(tx, { rawSlug: slug, sourceUrl: LITELLM_COST_MAP_URL });

      const result = await approveWitnessModel(tx, decision(planted.candidateId));

      const model = await tx.select().from(models).where(eq(models.id, result.modelId));
      expect(model).toEqual([
        expect.objectContaining({
          labId: planted.labId,
          name: "Witness Model",
          slug,
        }),
      ]);
      const offering = await tx.select().from(offerings).where(eq(offerings.modelId, result.modelId));
      expect(offering).toEqual([
        expect.objectContaining({ platform: "official-api", region: "global" }),
      ]);
      const alias = await tx
        .select()
        .from(modelAliases)
        .where(eq(modelAliases.modelId, result.modelId));
      expect(alias).toEqual([
        expect.objectContaining({ alias: slug, kind: "aggregator_slug" }),
      ]);
      const offeringId = offering[0]?.id ?? 0;
      expect(
        await tx.select({ id: priceVersions.id }).from(priceVersions).where(eq(priceVersions.offeringId, offeringId)),
      ).toEqual([]);
      expect(
        await tx
          .select({ id: observationItems.id })
          .from(observationItems)
          .where(eq(observationItems.offeringId, offeringId)),
      ).toEqual([]);
      const card = await tx
        .select()
        .from(candidateModels)
        .where(eq(candidateModels.id, planted.candidateId));
      expect(card[0]).toMatchObject({
        status: "approved",
        resolvedModelId: result.modelId,
        reviewedBy: "google:reviewer1",
        reviewNote: "Add the witness name.",
      });
    });
  });

  it("accepts an OpenRouter card the same way", async () => {
    await withRollback(async (tx) => {
      const slug = uniqueSlug("router");
      const planted = await plantCard(tx, { rawSlug: slug, sourceUrl: OPENROUTER_MODELS_URL });

      const result = await approveWitnessModel(tx, decision(planted.candidateId));

      const alias = await tx
        .select({ alias: modelAliases.alias })
        .from(modelAliases)
        .where(eq(modelAliases.modelId, result.modelId));
      expect(alias).toEqual([{ alias: slug }]);
    });
  });

  it("leaves the card pending when the source is an official page", async () => {
    await withRollback(async (tx) => {
      const slug = uniqueSlug("official");
      const planted = await plantCard(tx, {
        rawSlug: slug,
        sourceUrl: `https://example.test/official/${randomUUID()}`,
        sourceType: "official",
      });

      await expect(approveWitnessModel(tx, decision(planted.candidateId))).rejects.toThrow(/witness/);
      expect(await modelsWithSlug(tx, planted.labId, slug)).toEqual([]);
      expect(await cardStatus(tx, planted.candidateId)).toBe("pending_review");
    });
  });

  it("leaves the card pending when the aggregator url is not a witness we read", async () => {
    await withRollback(async (tx) => {
      const slug = uniqueSlug("other-list");
      const planted = await plantCard(tx, {
        rawSlug: slug,
        sourceUrl: `https://example.test/aggregator/${randomUUID()}`,
        sourceType: "aggregator",
      });

      await expect(approveWitnessModel(tx, decision(planted.candidateId))).rejects.toThrow(
        /LiteLLM or OpenRouter/,
      );
      expect(await cardStatus(tx, planted.candidateId)).toBe("pending_review");
    });
  });

  it("leaves the card pending when the lab is not one we track", async () => {
    await withRollback(async (tx) => {
      const slug = uniqueSlug("outside");
      const planted = await plantCard(tx, {
        rawSlug: slug,
        sourceUrl: LITELLM_COST_MAP_URL,
        labSlug: uniqueSlug("lab"),
      });

      await expect(approveWitnessModel(tx, decision(planted.candidateId))).rejects.toThrow(/witness lab/);
      expect(await modelsWithSlug(tx, planted.labId, slug)).toEqual([]);
      expect(await cardStatus(tx, planted.candidateId)).toBe("pending_review");
    });
  });

  it("leaves the card pending when the slug is not a public path segment", async () => {
    await withRollback(async (tx) => {
      const planted = await plantCard(tx, {
        rawSlug: "a/b",
        sourceUrl: LITELLM_COST_MAP_URL,
      });

      await expect(approveWitnessModel(tx, decision(planted.candidateId))).rejects.toThrow(/slash/);
      expect(await cardStatus(tx, planted.candidateId)).toBe("pending_review");
    });
  });

  it("leaves the card pending when the witness name is already an alias", async () => {
    await withRollback(async (tx) => {
      const slug = uniqueSlug("alias");
      const planted = await plantCard(tx, { rawSlug: slug, sourceUrl: LITELLM_COST_MAP_URL });
      const catalog = createCatalogRepository(tx);
      const other = await catalog.insertModel({
        labId: planted.labId,
        name: "Other model",
        slug: uniqueSlug("other"),
      });
      await catalog.insertModelAlias({
        modelId: other.id,
        alias: slug,
        kind: "aggregator_slug",
      });

      await expect(approveWitnessModel(tx, decision(planted.candidateId))).rejects.toThrow(
        /already an alias/,
      );
      expect(await modelsWithSlug(tx, planted.labId, slug)).toEqual([]);
      expect(await cardStatus(tx, planted.candidateId)).toBe("pending_review");
    });
  });

  it("leaves the card pending when that model is already tracked", async () => {
    await withRollback(async (tx) => {
      const slug = uniqueSlug("tracked");
      const planted = await plantCard(tx, { rawSlug: slug, sourceUrl: LITELLM_COST_MAP_URL });
      await createCatalogRepository(tx).insertModel({
        labId: planted.labId,
        name: "Already here",
        slug,
      });

      await expect(approveWitnessModel(tx, decision(planted.candidateId))).rejects.toThrow(/already tracked/);
      expect(await cardStatus(tx, planted.candidateId)).toBe("pending_review");
      expect(await modelsWithSlug(tx, planted.labId, slug)).toHaveLength(1);
    });
  });

  it("refuses a second decision after the card is approved", async () => {
    await withRollback(async (tx) => {
      const slug = uniqueSlug("twice");
      const planted = await plantCard(tx, { rawSlug: slug, sourceUrl: LITELLM_COST_MAP_URL });

      await approveWitnessModel(tx, decision(planted.candidateId));
      await expect(approveWitnessModel(tx, decision(planted.candidateId))).rejects.toThrow(/pending/);

      expect(await cardStatus(tx, planted.candidateId)).toBe("approved");
      expect(await modelsWithSlug(tx, planted.labId, slug)).toHaveLength(1);
    });
  });

  async function withRollback(run: (tx: SignalDb) => Promise<void>): Promise<void> {
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
    super("approve witness model test rolled back");
    this.name = "RolledBack";
  }
}

function untouchedDb(): SignalDb {
  return {
    transaction: () => {
      throw new Error("approveWitnessModel touched the database");
    },
  } as unknown as SignalDb;
}

function decision(candidateId: number) {
  return {
    candidateId,
    note: "Add the witness name.",
    reviewedBy: "google:reviewer1",
    reviewedAt: REVIEWED_AT,
  };
}

async function plantCard(
  tx: SignalDb,
  input: {
    rawSlug: string;
    sourceUrl: string;
    sourceType?: (typeof sourceType.enumValues)[number];
    labSlug?: string;
  },
) {
  const catalog = createCatalogRepository(tx);
  const labSlug = input.labSlug ?? "anthropic";
  const lab =
    (await catalog.findLabBySlug(labSlug)) ??
    (await catalog.insertLab({ name: labName(labSlug), slug: labSlug }));
  const source = await sourceFor(tx, input.sourceUrl, input.sourceType ?? "aggregator");
  const card = requireInsertedRow(
    await tx
      .insert(candidateModels)
      .values({
        labId: lab.id,
        rawName: "Witness Model",
        rawSlug: input.rawSlug,
        sourceId: source.id,
        firstSeenAt: SEEN_AT,
      })
      .returning({ id: candidateModels.id }),
    "insert candidate",
  );
  return { labId: lab.id, candidateId: card.id };
}

async function sourceFor(
  tx: SignalDb,
  url: string,
  type: (typeof sourceType.enumValues)[number],
) {
  const existing = await tx.select().from(sources).where(eq(sources.url, url)).limit(1);
  const row = existing[0];
  if (row !== undefined) {
    if (row.type !== type) {
      throw new Error(`source ${url} is ${row.type}, not ${type}`);
    }
    return row;
  }
  return requireInsertedRow(
    await tx.insert(sources).values({ url, type }).returning(),
    "insert source",
  );
}

function labName(slug: string): string {
  if (slug === "anthropic") {
    return "Anthropic";
  }
  if (slug === "openai") {
    return "OpenAI";
  }
  if (slug === "google") {
    return "Google";
  }
  return "Other lab";
}

async function modelsWithSlug(tx: SignalDb, labId: number, slug: string) {
  return tx
    .select({ id: models.id })
    .from(models)
    .where(and(eq(models.labId, labId), eq(models.slug, slug)));
}

async function cardStatus(tx: SignalDb, candidateId: number) {
  const rows = await tx
    .select({ status: candidateModels.status })
    .from(candidateModels)
    .where(eq(candidateModels.id, candidateId));
  return rows[0]?.status;
}

function uniqueSlug(prefix: string): string {
  return `${prefix}-${randomUUID()}`;
}
