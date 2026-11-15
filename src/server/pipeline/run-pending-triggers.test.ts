// @vitest-environment node

/**
 * The drain tests that open Neon skip when DATABASE_URL is missing.
 * Each of those tests rolls its transaction back. The HTTP tests do not
 * open a database.
 *
 * Local run:
 * node --env-file=.env ./node_modules/vitest/vitest.mjs run src/server/pipeline/run-pending-triggers.test.ts
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { eq, isNull } from "drizzle-orm";
import { parseAnthropicPricing } from "@/core/pricing/anthropic";
import { fingerprintParsedPrices } from "@/core/verification/fingerprint";
import { createDb } from "@/server/db/client";
import { requireInsertedRow } from "@/server/db/repositories/catalog";
import type { EvidenceDb } from "@/server/db/repositories/evidence";
import { fetchTriggers, labs, observations, priceVersions, sources } from "@/server/db/schema";
import { parseDatabaseEnv } from "@/server/env";
import { respondToTriggerDrain, runPendingTriggers } from "@/server/pipeline/run-pending-triggers";
import { anthropicSource } from "@/server/sources/anthropic-source";
import { openaiSource } from "@/server/sources/openai-source";
import type { FetchLike } from "@/server/sources/provider-source";

const databaseUrl = process.env.DATABASE_URL?.trim() ?? "";
const SECRET = "cron-secret-16ch";
const PAGE = readFileSync(path.join(process.cwd(), "tests/fixtures/anthropic-pricing.md"), "utf8");
const PARSED = parseAnthropicPricing(PAGE);
const PAGE_HASH = fingerprintParsedPrices({ rows: PARSED.rows, warnings: PARSED.warnings });
const SNAPSHOT_AT = new Date("2099-11-01T00:00:00.000Z");
const VISIT_AT = new Date("2099-11-02T00:00:00.000Z");
const EARLIER = new Date("2099-10-01T00:00:00.000Z");

describe("respondToTriggerDrain", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("refuses the request before opening a database when the secret does not match", async () => {
    const openDb = vi.fn();
    const response = await respondToTriggerDrain({
      authorization: null,
      env: { CRON_SECRET: SECRET },
      openDb,
      runDrain: async () => ({ processed: 0 }),
    });

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "unauthorized" });
    expect(openDb).not.toHaveBeenCalled();
  });

  it("returns 200 when nothing is waiting", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const response = await respondToTriggerDrain({
      authorization: `Bearer ${SECRET}`,
      headers: new Headers({ "ce-vssschedulename": "drain-triggers-1", "ce-id": "exec-1" }),
      env: { CRON_SECRET: SECRET, DATABASE_URL: "postgres://price_trail:secret@localhost/price_trail" },
      openDb: () => ({
        db: {} as EvidenceDb,
        close: async () => {},
      }),
      runDrain: async () => ({ processed: 0 }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ processed: 0 });
    expect(console.log).toHaveBeenCalledWith(
      JSON.stringify({ processed: 0, schedule: "drain-triggers-1", executionId: "exec-1" }),
    );
  });

  it("returns 200 for a filed download failure and leaves the database URL out", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const databaseUrlInEnv = "postgres://price_trail:secret@localhost/price_trail";
    const response = await respondToTriggerDrain({
      authorization: `Bearer ${SECRET}`,
      env: { CRON_SECRET: SECRET, DATABASE_URL: databaseUrlInEnv },
      openDb: () => ({
        db: {} as EvidenceDb,
        close: async () => {},
      }),
      runDrain: async () => ({
        processed: 1,
        triggerId: 4,
        result: { kind: "fetch_error", note: "network down" },
      }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({
      processed: 1,
      triggerId: 4,
      kind: "fetch_error",
      note: "network down",
    });
    expect(JSON.stringify(body)).not.toContain("secret");
    expect(vi.mocked(console.log).mock.calls[0]?.[0]).not.toContain(databaseUrlInEnv);
  });

  it("returns 500 without the database URL when the drain throws", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const databaseUrlInEnv = "postgres://price_trail:secret@localhost/price_trail";
    const response = await respondToTriggerDrain({
      authorization: `Bearer ${SECRET}`,
      env: { CRON_SECRET: SECRET, DATABASE_URL: databaseUrlInEnv },
      openDb: () => ({
        db: {} as EvidenceDb,
        close: async () => {},
      }),
      runDrain: async () => {
        throw new Error(`connect failed for ${databaseUrlInEnv}`);
      },
    });

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "trigger drain failed" });
    const logged = vi.mocked(console.error).mock.calls[0]?.[0];
    expect(logged).not.toContain(databaseUrlInEnv);
  });
});

describe.skipIf(databaseUrl.length === 0)("runPendingTriggers", () => {
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

  it("visits nothing when no trigger is waiting", async () => {
    await withRollback(async (tx) => {
      await clearPending(tx);
      const fetchImpl = countingFetch();
      const before = await priceCount(tx);

      const result = await runPendingTriggers(tx, visitInput(fetchImpl.fetchImpl, VISIT_AT));

      expect(result).toEqual({ processed: 0 });
      expect(fetchImpl.calls()).toBe(0);
      expect(await priceCount(tx)).toBe(before);
    });
  });

  it("marks the trigger processed when the download fails", async () => {
    await withRollback(async (tx) => {
      await clearPending(tx);
      await ensureOfficialSource(tx, anthropicSource.url);
      const triggerId = await insertTrigger(tx, anthropicSource.url, EARLIER);
      const before = await priceCount(tx);

      const result = await runPendingTriggers(
        tx,
        visitInput(async () => {
          throw new Error("network down");
        }, VISIT_AT),
      );

      expect(result).toMatchObject({
        processed: 1,
        triggerId,
        result: { kind: "fetch_error", note: "network down" },
      });
      expect(await processedAt(tx, triggerId)).toEqual(VISIT_AT);
      expect(await priceCount(tx)).toBe(before);
    });
  });

  it("marks the trigger processed when the parsed page is unchanged", async () => {
    await withRollback(async (tx) => {
      await clearPending(tx);
      const sourceId = await ensureOfficialSource(tx, anthropicSource.url);
      await insertMatchingSnapshot(tx, sourceId);
      const triggerId = await insertTrigger(tx, anthropicSource.url, EARLIER);
      const before = await priceCount(tx);

      const result = await runPendingTriggers(
        tx,
        visitInput(async (url) => {
          if (url !== anthropicSource.url) {
            throw new Error(`unexpected url ${url}`);
          }
          return new Response(PAGE, { status: 200 });
        }, VISIT_AT),
      );

      expect(result).toMatchObject({ processed: 1, triggerId, result: { kind: "unchanged" } });
      expect(await processedAt(tx, triggerId)).toEqual(VISIT_AT);
      expect(await priceCount(tx)).toBe(before);
    });
  });

  it("leaves the trigger pending when the visit throws", async () => {
    await withRollback(async (tx) => {
      await clearPending(tx);
      const sourceId = await ensureOfficialSource(tx, anthropicSource.url);
      await insertMatchingSnapshot(tx, sourceId);
      const triggerId = await insertTrigger(tx, anthropicSource.url, EARLIER);

      await expect(
        runPendingTriggers(
          tx,
          visitInput(async () => new Response(PAGE, { status: 200 }), EARLIER),
        ),
      ).rejects.toThrow(/earlier than the latest observation/);
      expect(await processedAt(tx, triggerId)).toBeNull();
    });
  });

  it("visits the oldest trigger and leaves the newer one pending", async () => {
    await withRollback(async (tx) => {
      await clearPending(tx);
      await ensureOfficialSource(tx, anthropicSource.url);
      await ensureOfficialSource(tx, openaiSource.url);
      const older = await insertTrigger(tx, anthropicSource.url, EARLIER);
      const newer = await insertTrigger(tx, openaiSource.url, VISIT_AT);

      const result = await runPendingTriggers(
        tx,
        visitInput(async () => {
          throw new Error("network down");
        }, VISIT_AT),
      );

      expect(result).toMatchObject({ processed: 1, triggerId: older });
      expect(await processedAt(tx, older)).toEqual(VISIT_AT);
      expect(await processedAt(tx, newer)).toBeNull();
    });
  });

  async function withRollback(run: (tx: EvidenceDb) => Promise<void>): Promise<void> {
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
    super("trigger drain test rolled back");
    this.name = "RolledBack";
  }
}

function visitInput(fetchImpl: FetchLike, fetchedAt: Date) {
  return {
    fetchedAt,
    processedAt: VISIT_AT,
    fetchImpl,
    env: {},
    now: () => 0,
    sleep: async () => {},
  };
}

function countingFetch(): { fetchImpl: FetchLike; calls: () => number } {
  let calls = 0;
  return {
    calls: () => calls,
    fetchImpl: async () => {
      calls += 1;
      throw new Error("fetch should not be called");
    },
  };
}

async function clearPending(tx: EvidenceDb): Promise<void> {
  await tx
    .update(fetchTriggers)
    .set({ processedAt: new Date("2099-12-31T00:00:00.000Z") })
    .where(isNull(fetchTriggers.processedAt));
}

async function ensureOfficialSource(tx: EvidenceDb, url: string): Promise<number> {
  await tx.insert(labs).values({ name: "Anthropic", slug: "anthropic" }).onConflictDoNothing();
  await tx.insert(sources).values({ url, type: "official", active: true }).onConflictDoNothing();
  const rows = await tx
    .select({ id: sources.id, type: sources.type, active: sources.active })
    .from(sources)
    .where(eq(sources.url, url));
  const source = rows[0];
  if (source === undefined || source.type !== "official" || !source.active) {
    throw new Error(`official source ${url} is not an active official page`);
  }
  return source.id;
}

async function insertTrigger(tx: EvidenceDb, url: string, createdAt: Date): Promise<number> {
  const source = requireInsertedRow(
    await tx.select({ id: sources.id }).from(sources).where(eq(sources.url, url)),
    "official source",
  );
  const trigger = requireInsertedRow(
    await tx
      .insert(fetchTriggers)
      .values({
        sourceId: source.id,
        reason: "aggregator_disagreement",
        createdAt,
      })
      .returning({ id: fetchTriggers.id }),
    "trigger",
  );
  return trigger.id;
}

async function insertMatchingSnapshot(tx: EvidenceDb, sourceId: number): Promise<void> {
  await tx.insert(observations).values({
    sourceId,
    fetchedAt: SNAPSHOT_AT,
    contentHash: PAGE_HASH,
    rawContent: PAGE,
    rawContentHash: createHash("sha256").update(PAGE).digest("hex"),
    parsedData: { rows: PARSED.rows, warnings: PARSED.warnings },
  });
}

async function processedAt(tx: EvidenceDb, triggerId: number): Promise<Date | null> {
  const rows = await tx
    .select({ processedAt: fetchTriggers.processedAt })
    .from(fetchTriggers)
    .where(eq(fetchTriggers.id, triggerId));
  return rows[0]?.processedAt ?? null;
}

async function priceCount(tx: EvidenceDb): Promise<number> {
  const rows = await tx.select({ id: priceVersions.id }).from(priceVersions);
  return rows.length;
}
