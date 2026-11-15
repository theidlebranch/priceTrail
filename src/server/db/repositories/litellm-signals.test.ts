// @vitest-environment node

/**
 * These tests talk to Neon. They skip when DATABASE_URL is missing, which
 * is what CI does. Each database test rolls its transaction back, so a
 * passing run leaves no rows.
 *
 * The jobs under test use example URLs. The one check that the real
 * LiteLLM and OpenRouter rows count as signal sources looks those URLs
 * up, and inserts a row only when this database does not have one yet.
 * That insert rolls back with the rest of the test.
 *
 * Local run:
 * node --env-file=.env ./node_modules/vitest/vitest.mjs run src/server/db/repositories/litellm-signals.test.ts
 */
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb } from "@/server/db/client";
import { requireInsertedRow } from "@/server/db/repositories/catalog";
import {
  assembleWitnessRead,
  hasSignalSource,
  listSignalJobs,
  listWitnessReadPage,
  WITNESS_READ_PAGE_SIZE,
} from "@/server/db/repositories/litellm-signals";
import type { SignalDb } from "@/server/pipeline/read-litellm-signal";
import {
  candidateModels,
  labs,
  modelSignals,
  models,
  offerings,
  sources,
  verificationFlags,
  witnessReads,
} from "@/server/db/schema";
import { parseDatabaseEnv } from "@/server/env";
import { LITELLM_COST_MAP_URL } from "@/server/sources/litellm-signal";
import { OPENROUTER_MODELS_URL } from "@/server/sources/openrouter-signal";

const databaseUrl = process.env.DATABASE_URL?.trim() ?? "";
const NEWER = new Date("2026-11-15T12:00:00.000Z");
const OLDER = new Date("2026-11-13T12:00:00.000Z");

describe("assembleWitnessRead", () => {
  it("throws when a successful read has no counts", () => {
    expect(() =>
      assembleWitnessRead({
        id: 1,
        fetchedAt: NEWER,
        outcome: "ok",
        note: "",
        agreedCount: null,
        notComparedCount: 0,
      }),
    ).toThrow(/missing its counts/);
  });

  it("throws when a failed read has no note", () => {
    expect(() =>
      assembleWitnessRead({
        id: 2,
        fetchedAt: NEWER,
        outcome: "fetch_error",
        note: " ",
        agreedCount: null,
        notComparedCount: null,
      }),
    ).toThrow(/without a note/);
  });
});

describe("listSignalJobs", () => {
  it("throws before a query when a url is repeated", async () => {
    const db = null as unknown as SignalDb;
    await expect(listSignalJobs(db, ["https://example.test/a", "https://example.test/a"])).rejects.toThrow(
      /repeat a url/,
    );
  });
});

describe.skipIf(databaseUrl.length === 0)("signal job reads", () => {
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

  it("keeps the asked-for order, a missing source, and the last good counts", async () => {
    await withRollback(async (tx) => {
      const presentUrl = `https://example.test/signals/${randomUUID()}/present`;
      const missingUrl = `https://example.test/signals/${randomUUID()}/missing`;
      const failedOnlyUrl = `https://example.test/signals/${randomUUID()}/failed`;
      const secret = `SECRET-SLUG-${randomUUID()}`;
      const presentId = await plantWitness(tx, presentUrl);
      const failedOnlyId = await plantWitness(tx, failedOnlyUrl);
      await plantCounts(tx, presentId);
      await plantCounts(tx, failedOnlyId);
      await plantReads(tx, presentId, secret);
      await tx.insert(witnessReads).values({
        sourceId: failedOnlyId,
        fetchedAt: NEWER,
        outcome: "fetch_error",
        note: "download failed",
        seenSlugs: [],
        isBaseline: false,
      });

      const listed = await listSignalJobs(tx, [failedOnlyUrl, missingUrl, presentUrl]);
      expect(listed.map((job) => job.url)).toEqual([failedOnlyUrl, missingUrl, presentUrl]);
      expect(listed[1]).toEqual({
        url: missingUrl,
        sourceId: null,
        latest: null,
        hasSuccessfulRead: false,
        disagreementCount: null,
        newNameCount: null,
        missingCount: null,
      });
      expect(listed[0]).toMatchObject({
        sourceId: failedOnlyId,
        hasSuccessfulRead: false,
        disagreementCount: null,
        newNameCount: null,
        missingCount: null,
        latest: { outcome: "fetch_error", note: "download failed" },
      });
      expect(listed[2]).toMatchObject({
        sourceId: presentId,
        hasSuccessfulRead: true,
        disagreementCount: 1,
        newNameCount: 1,
        missingCount: 1,
        latest: { outcome: "fetch_error", note: "later download failed" },
      });

      const page = await listWitnessReadPage(tx, presentId, null);
      expect(page).toHaveLength(WITNESS_READ_PAGE_SIZE);
      expect(page[0]).toMatchObject({ outcome: "fetch_error", note: "later download failed" });
      expect(JSON.stringify(page)).not.toContain(secret);
      expect(page[0]).not.toHaveProperty("seenSlugs");

      const oldestOnPage = page[page.length - 1];
      expect(oldestOnPage).toBeDefined();
      const older = await listWitnessReadPage(tx, presentId, {
        fetchedAt: oldestOnPage?.fetchedAt ?? NEWER,
        id: oldestOnPage?.id ?? 0,
      });
      expect(older).toHaveLength(1);
      expect(older[0]).toMatchObject({ outcome: "ok", agreedCount: 4, notComparedCount: 2 });
      expect(older[0]?.fetchedAt.getTime()).toBeLessThan(oldestOnPage?.fetchedAt.getTime() ?? 0);
    });
  });

  it("accepts only the LiteLLM and OpenRouter aggregator rows", async () => {
    await withRollback(async (tx) => {
      const suffix = randomUUID();
      const official = requireInsertedRow(
        await tx
          .insert(sources)
          .values({ url: `https://example.test/signals/${suffix}/official`, type: "official" })
          .returning({ id: sources.id }),
        "official source",
      );
      const other = requireInsertedRow(
        await tx
          .insert(sources)
          .values({ url: `https://example.test/signals/${suffix}/other`, type: "aggregator" })
          .returning({ id: sources.id }),
        "other aggregator",
      );

      expect(await hasSignalSource(tx, official.id)).toBe(false);
      expect(await hasSignalSource(tx, other.id)).toBe(false);
      expect(await hasSignalSource(tx, 9_007_199_254_740_991)).toBe(false);
      expect(await hasSignalSource(tx, await signalSourceId(tx, LITELLM_COST_MAP_URL))).toBe(true);
      expect(await hasSignalSource(tx, await signalSourceId(tx, OPENROUTER_MODELS_URL))).toBe(true);
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
    super("signal job test rolled back");
    this.name = "RolledBack";
  }
}

async function plantWitness(tx: SignalDb, url: string): Promise<number> {
  const source = requireInsertedRow(
    await tx.insert(sources).values({ url, type: "aggregator" }).returning({ id: sources.id }),
    "witness source",
  );
  return source.id;
}

async function plantCounts(tx: SignalDb, sourceId: number): Promise<void> {
  const suffix = randomUUID();
  const lab = requireInsertedRow(
    await tx
      .insert(labs)
      .values({ name: `Signal ${suffix}`, slug: `signal-${suffix}` })
      .returning({ id: labs.id }),
    "lab",
  );
  const priced = await plantModel(tx, lab.id, `priced-${suffix}`);
  const missing = await plantModel(tx, lab.id, `missing-${suffix}`);
  const unlinked = await plantModel(tx, lab.id, `unlinked-${suffix}`);
  const offering = requireInsertedRow(
    await tx
      .insert(offerings)
      .values({ modelId: priced, platform: "official-api", region: "global" })
      .returning({ id: offerings.id }),
    "offering",
  );
  await tx.insert(verificationFlags).values([
    {
      offeringId: offering.id,
      sourceId,
      dimension: "input",
      detectedAt: OLDER,
      aggregatorValue: "0.20",
      ourValue: "0.10",
    },
    {
      offeringId: offering.id,
      sourceId,
      dimension: "output",
      detectedAt: OLDER,
      aggregatorValue: "0.40",
      ourValue: "0.30",
      resolvedAt: OLDER,
      resolution: "human_rejected",
    },
  ]);
  await tx.insert(candidateModels).values([
    {
      labId: lab.id,
      rawName: "New model",
      rawSlug: `new-${suffix}`,
      sourceId,
      firstSeenAt: OLDER,
      status: "pending_review",
    },
    {
      labId: lab.id,
      rawName: "Rejected model",
      rawSlug: `rejected-${suffix}`,
      sourceId,
      firstSeenAt: OLDER,
      status: "rejected",
    },
  ]);
  await tx.insert(modelSignals).values([
    { modelId: missing, sourceId, kind: "missing", detectedAt: OLDER },
    { modelId: unlinked, sourceId, kind: "not_linked", detectedAt: OLDER },
  ]);
}

async function plantModel(tx: SignalDb, labId: number, slug: string): Promise<number> {
  const model = requireInsertedRow(
    await tx
      .insert(models)
      .values({ labId, name: slug, slug })
      .returning({ id: models.id }),
    "model",
  );
  return model.id;
}

async function plantReads(tx: SignalDb, sourceId: number, secret: string): Promise<void> {
  const reads: (typeof witnessReads.$inferInsert)[] = [];
  for (let index = 0; index < WITNESS_READ_PAGE_SIZE; index += 1) {
    const fetchedAt = new Date(OLDER.getTime() + index * 60_000);
    reads.push({
      sourceId,
      fetchedAt,
      outcome: "ok",
      note: "",
      seenSlugs: index === 0 ? [secret] : [],
      isBaseline: index === 0,
      agreedCount: 4,
      notComparedCount: 2,
    });
  }
  reads.push({
    sourceId,
    fetchedAt: NEWER,
    outcome: "fetch_error",
    note: "later download failed",
    seenSlugs: [secret],
    isBaseline: false,
    agreedCount: null,
    notComparedCount: null,
  });
  await tx.insert(witnessReads).values(reads);
}

async function signalSourceId(tx: SignalDb, url: string): Promise<number> {
  const existing = await tx
    .select({ id: sources.id, type: sources.type })
    .from(sources)
    .where(eq(sources.url, url));
  const row = existing[0];
  if (row === undefined) {
    const inserted = requireInsertedRow(
      await tx.insert(sources).values({ url, type: "aggregator" }).returning({ id: sources.id }),
      "signal source",
    );
    return inserted.id;
  }
  if (row.type !== "aggregator") {
    await tx.update(sources).set({ type: "aggregator" }).where(eq(sources.url, url));
  }
  return row.id;
}
