// @vitest-environment node

/**
 * A blank note throws before any query. The writes talk to Neon and skip
 * when DATABASE_URL is missing. Each database test rolls its transaction
 * back. These tests do not call publishPriceVersion().
 *
 * Local run:
 * node --env-file=.env ./node_modules/vitest/vitest.mjs run src/server/review/platform-model-review.test.ts
 */
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb } from "@/server/db/client";
import { createCatalogRepository, requireInsertedRow } from "@/server/db/repositories/catalog";
import { parseDatabaseEnv } from "@/server/env";
import type { SignalDb } from "@/server/pipeline/read-litellm-signal";
import { acceptModelRetirement } from "@/server/review/accept-model-retirement";
import { approvePlatformModel, approveNewName } from "@/server/review/approve-platform-model";
import { approveWitnessModel } from "@/server/review/approve-witness-model";
import { rejectCandidateModel } from "@/server/review/reject-candidate";
import {
  candidateModels,
  modelAliases,
  models,
  offerings,
  priceVersions,
  sources,
} from "@/server/db/schema";
import { ANTHROPIC_MODELS_URL } from "@/server/sources/official-model-list";
import { LITELLM_COST_MAP_URL } from "@/server/sources/litellm-signal";

const databaseUrl = process.env.DATABASE_URL?.trim() ?? "";
const SEEN_AT = new Date("2026-11-26T12:00:00.000Z");
const REVIEWED_AT = new Date("2026-11-26T18:30:00.000Z");

describe("platform model review input checks", () => {
  it("throws when the approve note is blank and does not open a transaction", async () => {
    await expect(
      approvePlatformModel(untouchedDb(), {
        candidateId: 1,
        note: "  ",
        reviewedBy: "google:reviewer1",
        reviewedAt: REVIEWED_AT,
      }),
    ).rejects.toThrow(/review note is empty/);
  });

  it("throws when the accept note is blank and does not open a transaction", async () => {
    await expect(
      acceptModelRetirement(untouchedDb(), {
        candidateId: 1,
        note: "",
        reviewedBy: "google:reviewer1",
        reviewedAt: REVIEWED_AT,
      }),
    ).rejects.toThrow(/review note is empty/);
  });
});

describe.skipIf(databaseUrl.length === 0)("platform model review", () => {
  let close: (() => Promise<void>) | undefined;
  let db: ReturnType<typeof createDb>["db"];

  beforeAll(() => {
    const opened = createDb(parseDatabaseEnv({ DATABASE_URL: databaseUrl }).databaseUrl);
    db = opened.db;
    close = () => opened.close();
  });

  afterAll(async () => {
    await close?.();
  });

  it("approves a new name with an offering and no alias or price", async () => {
    await withRollback(async (tx) => {
      const slug = uniqueSlug("listed");
      const planted = await plantCard(tx, { rawSlug: slug, kind: "new_name" });

      const result = await approveNewName(tx, decision(planted.candidateId, "Add the official id."));

      const model = await tx.select().from(models).where(eq(models.id, result.modelId));
      expect(model).toEqual([
        expect.objectContaining({ labId: planted.labId, slug, deprecatedAt: null }),
      ]);
      const offering = await tx.select().from(offerings).where(eq(offerings.modelId, result.modelId));
      expect(offering).toEqual([expect.objectContaining({ platform: "official-api", region: "global" })]);
      expect(await tx.select().from(modelAliases).where(eq(modelAliases.modelId, result.modelId))).toEqual([]);
      expect(await pricesFor(tx, result.modelId)).toEqual([]);
      expect(await cardStatus(tx, planted.candidateId)).toBe("approved");
    });
  });

  it("refuses a model-list card from the witness approve, and a witness card from the list approve", async () => {
    await withRollback(async (tx) => {
      const listed = await plantCard(tx, { rawSlug: uniqueSlug("listed"), kind: "new_name" });
      const witness = await plantCard(tx, {
        rawSlug: uniqueSlug("witness"),
        kind: "new_name",
        sourceUrl: LITELLM_COST_MAP_URL,
        sourceType: "aggregator",
      });

      await expect(approveWitnessModel(tx, decision(listed.candidateId, "No."))).rejects.toThrow(
        /not a witness|not LiteLLM or OpenRouter/,
      );
      await expect(approvePlatformModel(tx, decision(witness.candidateId, "No."))).rejects.toThrow(
        /not an official model list/,
      );
      expect(await cardStatus(tx, listed.candidateId)).toBe("pending_review");
      expect(await cardStatus(tx, witness.candidateId)).toBe("pending_review");
    });
  });

  it("accepts a retirement by setting deprecated_at to the review time", async () => {
    await withRollback(async (tx) => {
      const slug = uniqueSlug("retire");
      const model = await plantModel(tx, slug);
      const planted = await plantCard(tx, { rawSlug: slug, kind: "retirement", hint: "Shutdown date 2027-06-01." });

      const result = await acceptModelRetirement(tx, decision(planted.candidateId, "Retire it."));

      expect(result.modelId).toBe(model.id);
      const row = await tx.select().from(models).where(eq(models.id, model.id));
      expect(row[0]?.deprecatedAt?.getTime()).toBe(REVIEWED_AT.getTime());
      expect(await pricesFor(tx, model.id)).toEqual([]);
      expect(await cardStatus(tx, planted.candidateId)).toBe("approved");

      await expect(acceptModelRetirement(tx, decision(planted.candidateId, "Again."))).rejects.toThrow(
        /not pending/,
      );
      const again = await tx.select({ deprecatedAt: models.deprecatedAt }).from(models).where(eq(models.id, model.id));
      expect(again[0]?.deprecatedAt?.getTime()).toBe(REVIEWED_AT.getTime());
    });
  });

  it("creates an untracked model when the retirement is accepted", async () => {
    await withRollback(async (tx) => {
      const slug = uniqueSlug("new-retire");
      const planted = await plantCard(tx, {
        rawSlug: slug,
        kind: "retirement",
        hint: "Lifecycle deprecated.",
        rawName: "Claude Old",
      });

      const result = await acceptModelRetirement(tx, decision(planted.candidateId, "Track it as retired."));

      const model = await tx.select().from(models).where(eq(models.id, result.modelId));
      expect(model[0]).toMatchObject({ slug, name: "Claude Old" });
      expect(model[0]?.deprecatedAt?.getTime()).toBe(REVIEWED_AT.getTime());
      const offering = await tx.select().from(offerings).where(eq(offerings.modelId, result.modelId));
      expect(offering).toEqual([expect.objectContaining({ platform: "official-api", region: "global" })]);
      expect(await tx.select().from(modelAliases).where(eq(modelAliases.modelId, result.modelId))).toEqual([]);
      expect(await pricesFor(tx, result.modelId)).toEqual([]);
    });
  });

  it("accepts a pricing-page retirement without publishing a price", async () => {
    await withRollback(async (tx) => {
      const slug = uniqueSlug("page-retire");
      const planted = await plantCard(tx, {
        rawSlug: slug,
        kind: "retirement",
        hint: "retired",
        rawName: "Claude Old",
        sourceUrl: `https://example.test/pricing/${slug}`,
        sourceType: "official",
      });

      const result = await acceptModelRetirement(tx, decision(planted.candidateId, "Track it as retired."));

      const model = await tx.select().from(models).where(eq(models.id, result.modelId));
      expect(model[0]?.slug).toBe(slug);
      expect(model[0]?.deprecatedAt?.getTime()).toBe(REVIEWED_AT.getTime());
      expect(await pricesFor(tx, result.modelId)).toEqual([]);
    });
  });

  it("accepts a gone card by retiring the tracked model and does not publish", async () => {
    await withRollback(async (tx) => {
      const slug = uniqueSlug("gone");
      const model = await plantModel(tx, slug);
      const planted = await plantCard(tx, {
        rawSlug: slug,
        kind: "gone",
        hint: "Missing from two good pricing visits.",
        sourceUrl: `https://example.test/pricing/${slug}`,
        sourceType: "official",
      });

      const result = await acceptModelRetirement(tx, decision(planted.candidateId, "It left the page."));

      expect(result.modelId).toBe(model.id);
      const row = await tx.select({ deprecatedAt: models.deprecatedAt }).from(models).where(eq(models.id, model.id));
      expect(row[0]?.deprecatedAt?.getTime()).toBe(REVIEWED_AT.getTime());
      expect(await pricesFor(tx, model.id)).toEqual([]);
    });
  });

  it("refuses a gone card when the model is not tracked", async () => {
    await withRollback(async (tx) => {
      const slug = uniqueSlug("gone-missing");
      const planted = await plantCard(tx, {
        rawSlug: slug,
        kind: "gone",
        hint: "Missing from two good pricing visits.",
        sourceUrl: `https://example.test/pricing/${slug}`,
        sourceType: "official",
      });

      await expect(acceptModelRetirement(tx, decision(planted.candidateId, "No model."))).rejects.toThrow(
        /not tracked/,
      );
      expect(await cardStatus(tx, planted.candidateId)).toBe("pending_review");
    });
  });

  it("rejects a retirement without changing the model", async () => {
    await withRollback(async (tx) => {
      const slug = uniqueSlug("keep");
      const model = await plantModel(tx, slug);
      const planted = await plantCard(tx, { rawSlug: slug, kind: "retirement", hint: "Lifecycle retired." });

      await rejectCandidateModel(tx, decision(planted.candidateId, "Still current."));

      const row = await tx.select({ deprecatedAt: models.deprecatedAt }).from(models).where(eq(models.id, model.id));
      expect(row[0]?.deprecatedAt).toBeNull();
      expect(await cardStatus(tx, planted.candidateId)).toBe("rejected");
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
    super("platform review test rolled back");
    this.name = "RolledBack";
  }
}

function untouchedDb(): SignalDb {
  return {
    transaction: () => {
      throw new Error("review touched the database");
    },
  } as unknown as SignalDb;
}

function decision(candidateId: number, note: string) {
  return {
    candidateId,
    note,
    reviewedBy: "google:reviewer1",
    reviewedAt: REVIEWED_AT,
  };
}

async function plantModel(tx: SignalDb, slug: string): Promise<{ id: number; labId: number }> {
  const catalog = createCatalogRepository(tx);
  const lab =
    (await catalog.findLabBySlug("anthropic")) ??
    (await catalog.insertLab({ name: "Anthropic", slug: "anthropic" }));
  const model = await catalog.insertModel({ labId: lab.id, name: slug, slug });
  await catalog.insertOffering({ modelId: model.id, platform: "official-api" });
  return { id: model.id, labId: lab.id };
}

async function plantCard(
  tx: SignalDb,
  input: {
    rawSlug: string;
    kind: "new_name" | "retirement" | "gone";
    hint?: string;
    rawName?: string;
    sourceUrl?: string;
    sourceType?: "platform_api" | "aggregator" | "official";
  },
) {
  const catalog = createCatalogRepository(tx);
  const lab =
    (await catalog.findLabBySlug("anthropic")) ??
    (await catalog.insertLab({ name: "Anthropic", slug: "anthropic" }));
  const sourceUrl = input.sourceUrl ?? ANTHROPIC_MODELS_URL;
  const sourceType = input.sourceType ?? "platform_api";
  const existing = await tx.select().from(sources).where(eq(sources.url, sourceUrl)).limit(1);
  const source =
    existing[0] ??
    requireInsertedRow(
      await tx.insert(sources).values({ url: sourceUrl, type: sourceType }).returning(),
      "source",
    );
  if (source.type !== sourceType) {
    throw new Error(`source ${sourceUrl} is ${source.type}`);
  }
  const card = requireInsertedRow(
    await tx
      .insert(candidateModels)
      .values({
        labId: lab.id,
        rawName: input.rawName ?? "Listed model",
        rawSlug: input.rawSlug,
        sourceId: source.id,
        firstSeenAt: SEEN_AT,
        kind: input.kind,
        hint: input.hint ?? null,
      })
      .returning({ id: candidateModels.id }),
    "candidate",
  );
  return { labId: lab.id, candidateId: card.id };
}

async function pricesFor(tx: SignalDb, modelId: number) {
  return tx
    .select({ id: priceVersions.id })
    .from(priceVersions)
    .innerJoin(offerings, eq(offerings.id, priceVersions.offeringId))
    .where(and(eq(offerings.modelId, modelId)));
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
