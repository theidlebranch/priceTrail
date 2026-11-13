// @vitest-environment node

/**
 * These tests talk to Neon. They skip when DATABASE_URL is missing, which
 * is what CI does. Each database test rolls its transaction back.
 *
 * The reader sees every Anthropic, OpenAI, and Google model already in
 * the database. Assertions look at the model this test planted.
 *
 * Local run:
 * node --env-file=.env ./node_modules/vitest/vitest.mjs run src/server/pipeline/read-litellm-signal.test.ts
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { createDb } from "@/server/db/client";
import { requireInsertedRow } from "@/server/db/repositories/catalog";
import { readLiteLLMSignal, type SignalDb } from "@/server/pipeline/read-litellm-signal";
import { rejectCandidateModel } from "@/server/review/reject-candidate";
import {
  candidateModels,
  labs,
  modelAliases,
  modelSignals,
  models,
  offerings,
  priceComponents,
  priceVersions,
  sources,
  verificationFlags,
  witnessReads,
} from "@/server/db/schema";
import { LITELLM_COST_MAP_URL } from "@/server/sources/litellm-signal";
import { parseDatabaseEnv } from "@/server/env";

const databaseUrl = process.env.DATABASE_URL?.trim() ?? "";
const FIRST = new Date("2026-11-13T16:00:00.000Z");
const SECOND = new Date("2026-11-13T22:00:00.000Z");
const THIRD = new Date("2026-11-14T04:00:00.000Z");

describe.skipIf(databaseUrl.length === 0)("readLiteLLMSignal", () => {
  let db: ReturnType<typeof createDb>["db"];
  let close: ReturnType<typeof createDb>["close"];

  beforeAll(() => {
    const opened = createDb(parseDatabaseEnv({ DATABASE_URL: databaseUrl }).databaseUrl);
    db = opened.db;
    close = opened.close;
  });

  afterAll(async () => {
    await close();
  });

  it("stores a disagreement on the first read and no new-name card", async () => {
    await withRollback(async (tx) => {
      await clearWitness(tx);
      const planted = await plantModel(tx);
      const result = await readLiteLLMSignal(tx, {
        fetchedAt: FIRST,
        fetchImpl: fakeFetch(costMap({ [planted.alias]: 0.00002, "claude-extra": 0.00001 })),
      });

      expect(result).toMatchObject({ kind: "ok", isBaseline: true, newModelCount: 0 });
      const flags = await flagsFor(tx, planted.offeringId);
      expect(flags).toEqual([{ ourValue: "10", aggregatorValue: "20", dimension: "input" }]);
      const cards = await tx
        .select({ rawSlug: candidateModels.rawSlug })
        .from(candidateModels)
        .where(eq(candidateModels.rawSlug, "claude-extra"));
      expect(cards).toEqual([]);
    });
  });

  it("opens one card for a slug the previous read did not see", async () => {
    await withRollback(async (tx) => {
      await clearWitness(tx);
      const planted = await plantModel(tx);
      await readLiteLLMSignal(tx, {
        fetchedAt: FIRST,
        fetchImpl: fakeFetch(costMap({ [planted.alias]: 0.00001 })),
      });
      const result = await readLiteLLMSignal(tx, {
        fetchedAt: SECOND,
        fetchImpl: fakeFetch(costMap({ [planted.alias]: 0.00001, "claude-new-name": 0.00001 })),
      });

      expect(result).toMatchObject({ kind: "ok", isBaseline: false, newModelCount: 1 });
      const cards = await tx
        .select({ rawSlug: candidateModels.rawSlug, status: candidateModels.status })
        .from(candidateModels)
        .where(eq(candidateModels.rawSlug, "claude-new-name"));
      expect(cards).toEqual([{ rawSlug: "claude-new-name", status: "pending_review" }]);
    });
  });

  it("rejects a card and does not open it again", async () => {
    await withRollback(async (tx) => {
      await clearWitness(tx);
      const planted = await plantModel(tx);
      await readLiteLLMSignal(tx, {
        fetchedAt: FIRST,
        fetchImpl: fakeFetch(costMap({ [planted.alias]: 0.00001 })),
      });
      await readLiteLLMSignal(tx, {
        fetchedAt: SECOND,
        fetchImpl: fakeFetch(costMap({ [planted.alias]: 0.00001, "claude-new-name": 0.00001 })),
      });
      const card = requireInsertedRow(
        await tx
          .select({ id: candidateModels.id })
          .from(candidateModels)
          .where(eq(candidateModels.rawSlug, "claude-new-name")),
        "candidate",
      );

      await expect(
        rejectCandidateModel(tx, {
          candidateId: card.id,
          note: "   ",
          reviewedBy: "github:1",
          reviewedAt: SECOND,
        }),
      ).rejects.toThrow(/review note is empty/);
      await rejectCandidateModel(tx, {
        candidateId: card.id,
        note: "Not a model we track.",
        reviewedBy: "github:1",
        reviewedAt: SECOND,
      });
      await readLiteLLMSignal(tx, {
        fetchedAt: THIRD,
        fetchImpl: fakeFetch(costMap({ [planted.alias]: 0.00001, "claude-new-name": 0.00001 })),
      });

      const cards = await tx
        .select({ status: candidateModels.status })
        .from(candidateModels)
        .where(eq(candidateModels.rawSlug, "claude-new-name"));
      expect(cards).toEqual([{ status: "rejected" }]);
    });
  }, 20_000);

  it("leaves the previous disagreement in place when the download fails", async () => {
    await withRollback(async (tx) => {
      await clearWitness(tx);
      const planted = await plantModel(tx);
      await readLiteLLMSignal(tx, {
        fetchedAt: FIRST,
        fetchImpl: fakeFetch(costMap({ [planted.alias]: 0.00002 })),
      });
      const result = await readLiteLLMSignal(tx, {
        fetchedAt: SECOND,
        fetchImpl: async () => {
          throw new Error("network down");
        },
      });

      expect(result.kind).toBe("fetch_error");
      expect(await flagsFor(tx, planted.offeringId)).toHaveLength(1);
    });
  });

  it("marks a linked model that disappears as missing, and a model with no alias as not linked", async () => {
    await withRollback(async (tx) => {
      await clearWitness(tx);
      const planted = await plantModel(tx);
      const unlinked = await plantModel(tx, { withAlias: false });
      await readLiteLLMSignal(tx, {
        fetchedAt: FIRST,
        fetchImpl: fakeFetch(costMap({ [planted.alias]: 0.00001 })),
      });
      await readLiteLLMSignal(tx, {
        fetchedAt: SECOND,
        fetchImpl: fakeFetch(costMap({ "claude-other": 0.00001 })),
      });

      const signals = await tx
        .select({ modelId: modelSignals.modelId, kind: modelSignals.kind })
        .from(modelSignals)
        .where(eq(modelSignals.modelId, planted.modelId));
      const unlinkedSignals = await tx
        .select({ kind: modelSignals.kind })
        .from(modelSignals)
        .where(eq(modelSignals.modelId, unlinked.modelId));
      expect(signals).toEqual([{ modelId: planted.modelId, kind: "missing" }]);
      expect(unlinkedSignals).toEqual([{ kind: "not_linked" }]);
    });
  });

  it("throws and stores nothing when a model has two open prices", async () => {
    await withRollback(async (tx) => {
      await clearWitness(tx);
      const planted = await plantModel(tx);
      await plantOpenPrice(tx, planted.offeringId, "12");
      await expect(
        readLiteLLMSignal(tx, {
          fetchedAt: FIRST,
          fetchImpl: fakeFetch(costMap({ [planted.alias]: 0.00001 })),
        }),
      ).rejects.toThrow(/two open prices/);
      const reads = await tx
        .select({ id: witnessReads.id })
        .from(witnessReads)
        .innerJoin(sources, eq(witnessReads.sourceId, sources.id))
        .where(eq(sources.url, LITELLM_COST_MAP_URL));
      expect(reads).toEqual([]);
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
    super("litellm signal test rolled back");
    this.name = "RolledBack";
  }
}

async function clearWitness(tx: SignalDb): Promise<void> {
  const sourceRows = await tx
    .select({ id: sources.id })
    .from(sources)
    .where(eq(sources.url, LITELLM_COST_MAP_URL));
  const sourceId = sourceRows[0]?.id;
  if (sourceId === undefined) {
    return;
  }
  await tx.delete(verificationFlags).where(eq(verificationFlags.sourceId, sourceId));
  await tx.delete(modelSignals).where(eq(modelSignals.sourceId, sourceId));
  await tx.delete(candidateModels).where(eq(candidateModels.sourceId, sourceId));
  await tx.delete(witnessReads).where(eq(witnessReads.sourceId, sourceId));
}

async function plantModel(
  tx: SignalDb,
  options: { withAlias?: boolean } = {},
): Promise<{ modelId: number; offeringId: number; alias: string }> {
  const withAlias = options.withAlias ?? true;
  const suffix = randomUUID();
  const labRows = await tx
    .select({ id: labs.id })
    .from(labs)
    .where(eq(labs.slug, "anthropic"))
    .limit(1);
  const lab =
    labRows[0] ??
    requireInsertedRow(
      await tx.insert(labs).values({ name: "Anthropic", slug: "anthropic" }).returning(),
      "lab",
    );
  const model = requireInsertedRow(
    await tx
      .insert(models)
      .values({ labId: lab.id, name: `Signal ${suffix}`, slug: `signal-${suffix}` })
      .returning(),
    "model",
  );
  const alias = `signal-alias-${suffix}`;
  if (withAlias) {
    await tx.insert(modelAliases).values({
      modelId: model.id,
      alias,
      kind: "aggregator_slug",
    });
  }
  const offering = requireInsertedRow(
    await tx
      .insert(offerings)
      .values({ modelId: model.id, platform: "official-api", region: "global" })
      .returning(),
    "offering",
  );
  await plantOpenPrice(tx, offering.id, "10");
  return { modelId: model.id, offeringId: offering.id, alias };
}

async function plantOpenPrice(tx: SignalDb, offeringId: number, amount: string): Promise<void> {
  const version = requireInsertedRow(
    await tx
      .insert(priceVersions)
      .values({ offeringId, firstSeenAt: FIRST })
      .returning({ id: priceVersions.id }),
    "price version",
  );
  await tx.insert(priceComponents).values({
    priceVersionId: version.id,
    dimension: "input",
    unit: "usd_per_1m_tokens",
    amount,
  });
}

async function flagsFor(
  tx: SignalDb,
  offeringId: number,
): Promise<{ ourValue: string; aggregatorValue: string; dimension: string }[]> {
  return tx
    .select({
      ourValue: verificationFlags.ourValue,
      aggregatorValue: verificationFlags.aggregatorValue,
      dimension: verificationFlags.dimension,
    })
    .from(verificationFlags)
    .where(and(eq(verificationFlags.offeringId, offeringId), eq(verificationFlags.dimension, "input")));
}

function costMap(inputs: Record<string, number>): string {
  const body: Record<string, unknown> = {};
  for (const [key, input] of Object.entries(inputs)) {
    body[key] = {
      litellm_provider: "anthropic",
      mode: "chat",
      input_cost_per_token: input,
      output_cost_per_token: input,
    };
  }
  return JSON.stringify(body);
}

function fakeFetch(body: string): () => Promise<Response> {
  return async () => new Response(body, { status: 200 });
}
