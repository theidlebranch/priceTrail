// @vitest-environment node

/**
 * These tests talk to Neon. They skip when DATABASE_URL is missing, which
 * is what CI does. Each database test rolls its transaction back, so a
 * passing run leaves no rows.
 *
 * The counts below are for rows this test inserted. A seeded database can
 * already hold price versions. Those rows belong to other offerings, and
 * this transaction does not touch them.
 *
 * Local run:
 * node --env-file=.env ./node_modules/vitest/vitest.mjs run src/server/db/repositories/evidence.test.ts
 */
import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asc, eq } from "drizzle-orm";
import type { NormalizedPrice } from "@/core/pricing/shape";
import { fingerprintParsedPrices } from "@/core/verification/fingerprint";
import { createDb } from "@/server/db/client";
import { createCatalogRepository, requireInsertedRow } from "@/server/db/repositories/catalog";
import {
  recordSourceCheck,
  type EvidenceDb,
  type RecordSourceCheckInput,
} from "@/server/db/repositories/evidence";
import {
  fetchLog,
  observationItems,
  observations,
  priceVersions,
  sources,
} from "@/server/db/schema";
import { parseDatabaseEnv } from "@/server/env";

const databaseUrl = process.env.DATABASE_URL?.trim() ?? "";
const FIRST_SEEN = new Date("2026-06-02T16:00:00.000Z");
const NEXT_SEEN = new Date("2026-06-03T16:00:00.000Z");
const EARLIER = new Date("2026-06-01T16:00:00.000Z");

describe.skipIf(databaseUrl.length === 0)("recordSourceCheck", () => {
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

  it("stores a first snapshot as flagged and does not open a price", async () => {
    await withEvidence(async (tx) => {
      const planted = await plantCatalog(tx);
      const rows = [
        priceRow(planted.modelSlug, "1"),
        priceRow(planted.modelSlug, "5", "output"),
        priceRow("not-tracked", "9"),
      ];
      const warnings = ["unmapped column: batch"];
      const rawContent = "pricing page body";

      const filed = await recordSourceCheck(
        tx,
        parsedCheck({
          sourceId: planted.sourceId,
          labSlug: planted.labSlug,
          fetchedAt: FIRST_SEEN,
          rows,
          warnings,
          rawContent,
        }),
      );

      expect(filed).toEqual({ outcome: "changed", observationId: expect.any(Number) });

      const stored = await tx
        .select()
        .from(observations)
        .where(eq(observations.sourceId, planted.sourceId));
      expect(stored).toHaveLength(1);
      expect(stored[0]).toMatchObject({
        id: filed.observationId,
        fetchedAt: FIRST_SEEN,
        contentHash: fingerprintParsedPrices({ rows, warnings }),
        rawContent,
        rawContentHash: sha256(rawContent),
        parsedData: { rows, warnings },
        archiveUrl: null,
        archiveStatus: "pending",
      });

      const items = await tx
        .select()
        .from(observationItems)
        .where(eq(observationItems.observationId, filed.observationId ?? 0));
      expect(items).toHaveLength(1);
      expect(items[0]).toMatchObject({
        offeringId: planted.offeringId,
        reviewStatus: "flagged",
        groundingResult: null,
        reviewedBy: null,
        reviewedAt: null,
        reviewNote: null,
      });

      const logs = await logsFor(tx, planted.sourceId);
      expect(logs).toEqual([
        expect.objectContaining({
          httpStatus: 200,
          outcome: "changed",
          observationId: filed.observationId,
          note: null,
          fetchedAt: FIRST_SEEN,
        }),
      ]);

      const source = await tx
        .select({ lastCheckedAt: sources.lastCheckedAt })
        .from(sources)
        .where(eq(sources.id, planted.sourceId));
      expect(source[0]?.lastCheckedAt).toEqual(FIRST_SEEN);
      expect(await priceCount(tx, planted.offeringId)).toBe(0);
    });
  });

  it("writes only a fetch log when the fingerprint is the same", async () => {
    await withEvidence(async (tx) => {
      const planted = await plantCatalog(tx);
      const rows = [priceRow(planted.modelSlug, "1"), priceRow(planted.modelSlug, "5", "output")];
      const warnings = ["column batch", "column flex"];
      const first = parsedCheck({
        sourceId: planted.sourceId,
        labSlug: planted.labSlug,
        fetchedAt: FIRST_SEEN,
        rows,
        warnings,
        rawContent: "first body",
      });
      await recordSourceCheck(tx, first);

      const filed = await recordSourceCheck(
        tx,
        parsedCheck({
          sourceId: planted.sourceId,
          labSlug: planted.labSlug,
          fetchedAt: NEXT_SEEN,
          rows: [...rows].reverse(),
          warnings: [...warnings].reverse(),
          rawContent: "same prices, different markup",
        }),
      );

      expect(filed).toEqual({ outcome: "unchanged", observationId: null });
      const stored = await tx
        .select()
        .from(observations)
        .where(eq(observations.sourceId, planted.sourceId));
      expect(stored).toHaveLength(1);
      expect(stored[0]).toMatchObject({ rawContent: "first body", fetchedAt: FIRST_SEEN });

      const logs = await logsFor(tx, planted.sourceId);
      expect(logs.map((log) => log.outcome)).toEqual(["changed", "unchanged"]);
      expect(logs[1]).toMatchObject({ observationId: null, httpStatus: 200, fetchedAt: NEXT_SEEN });

      const source = await tx
        .select({ lastCheckedAt: sources.lastCheckedAt })
        .from(sources)
        .where(eq(sources.id, planted.sourceId));
      expect(source[0]?.lastCheckedAt).toEqual(NEXT_SEEN);
      expect(await priceCount(tx, planted.offeringId)).toBe(0);
    });
  });

  it("stores a new snapshot when an amount changes and still does not open a price", async () => {
    await withEvidence(async (tx) => {
      const planted = await plantCatalog(tx);
      await recordSourceCheck(
        tx,
        parsedCheck({
          sourceId: planted.sourceId,
          labSlug: planted.labSlug,
          fetchedAt: FIRST_SEEN,
          rows: [priceRow(planted.modelSlug, "1")],
        }),
      );

      const filed = await recordSourceCheck(
        tx,
        parsedCheck({
          sourceId: planted.sourceId,
          labSlug: planted.labSlug,
          fetchedAt: NEXT_SEEN,
          rows: [priceRow(planted.modelSlug, "2")],
        }),
      );

      expect(filed.outcome).toBe("changed");
      const stored = await tx
        .select({ id: observations.id })
        .from(observations)
        .where(eq(observations.sourceId, planted.sourceId));
      expect(stored).toHaveLength(2);
      const items = await tx
        .select({ reviewStatus: observationItems.reviewStatus })
        .from(observationItems)
        .where(eq(observationItems.observationId, filed.observationId ?? 0));
      expect(items).toEqual([{ reviewStatus: "flagged" }]);
      expect(await priceCount(tx, planted.offeringId)).toBe(0);
    });
  });

  it("records a missing tracked model as parser_suspect and drops the page text", async () => {
    await withEvidence(async (tx) => {
      const planted = await plantCatalog(tx);
      const rawContent = "SECRET-PAGE-BODY";

      const filed = await recordSourceCheck(
        tx,
        parsedCheck({
          sourceId: planted.sourceId,
          labSlug: planted.labSlug,
          fetchedAt: FIRST_SEEN,
          rows: [priceRow("some-other-model", "1")],
          rawContent,
        }),
      );

      expect(filed).toEqual({ outcome: "parser_suspect", observationId: null });
      expect(await observationCount(tx, planted.sourceId)).toBe(0);
      const logs = await logsFor(tx, planted.sourceId);
      expect(logs).toHaveLength(1);
      expect(logs[0]).toMatchObject({
        outcome: "parser_suspect",
        observationId: null,
        httpStatus: 200,
        note: `missing tracked model: ${planted.modelSlug}`,
      });
      expect(logs[0]?.note).not.toContain(rawContent);
      expect(await priceCount(tx, planted.offeringId)).toBe(0);
    });
  });

  it("records an empty parse as parser_suspect without listing every missing model", async () => {
    await withEvidence(async (tx) => {
      const planted = await plantCatalog(tx);

      const filed = await recordSourceCheck(
        tx,
        parsedCheck({
          sourceId: planted.sourceId,
          labSlug: planted.labSlug,
          fetchedAt: FIRST_SEEN,
          rows: [],
          rawContent: "empty table",
        }),
      );

      expect(filed).toEqual({ outcome: "parser_suspect", observationId: null });
      const logs = await logsFor(tx, planted.sourceId);
      expect(logs[0]?.note).toBe("parsed price rows are empty");
      expect(await observationCount(tx, planted.sourceId)).toBe(0);
    });
  });

  it("records a parser throw as parser_suspect and keeps the caller's note", async () => {
    await withEvidence(async (tx) => {
      const planted = await plantCatalog(tx);

      const filed = await recordSourceCheck(tx, {
        sourceId: planted.sourceId,
        labSlug: planted.labSlug,
        fetchedAt: FIRST_SEEN,
        httpStatus: 200,
        result: { kind: "parser_suspect", note: "  0 matching tables  " },
      });

      expect(filed).toEqual({ outcome: "parser_suspect", observationId: null });
      const logs = await logsFor(tx, planted.sourceId);
      expect(logs[0]).toMatchObject({
        outcome: "parser_suspect",
        note: "0 matching tables",
        observationId: null,
      });
      expect(await observationCount(tx, planted.sourceId)).toBe(0);
    });
  });

  it("records a download failure with an empty HTTP status and no snapshot", async () => {
    await withEvidence(async (tx) => {
      const planted = await plantCatalog(tx);

      const filed = await recordSourceCheck(tx, {
        sourceId: planted.sourceId,
        labSlug: planted.labSlug,
        fetchedAt: FIRST_SEEN,
        httpStatus: null,
        result: { kind: "fetch_error", note: "network down" },
      });

      expect(filed).toEqual({ outcome: "fetch_error", observationId: null });
      const logs = await logsFor(tx, planted.sourceId);
      expect(logs[0]).toMatchObject({
        outcome: "fetch_error",
        httpStatus: null,
        observationId: null,
        note: "network down",
      });
      expect(await observationCount(tx, planted.sourceId)).toBe(0);
      const source = await tx
        .select({ lastCheckedAt: sources.lastCheckedAt })
        .from(sources)
        .where(eq(sources.id, planted.sourceId));
      expect(source[0]?.lastCheckedAt).toEqual(FIRST_SEEN);
    });
  });

  it("keeps the HTTP status of a blocked download", async () => {
    await withEvidence(async (tx) => {
      const planted = await plantCatalog(tx);

      await recordSourceCheck(tx, {
        sourceId: planted.sourceId,
        labSlug: planted.labSlug,
        fetchedAt: FIRST_SEEN,
        httpStatus: 503,
        result: { kind: "fetch_error", note: "upstream unavailable" },
      });

      const logs = await logsFor(tx, planted.sourceId);
      expect(logs[0]).toMatchObject({ httpStatus: 503, outcome: "fetch_error" });
      expect(await observationCount(tx, planted.sourceId)).toBe(0);
    });
  });

  it("throws when the check is earlier than the latest snapshot and writes no second log", async () => {
    await withEvidence(async (tx) => {
      const planted = await plantCatalog(tx);
      await recordSourceCheck(
        tx,
        parsedCheck({
          sourceId: planted.sourceId,
          labSlug: planted.labSlug,
          fetchedAt: NEXT_SEEN,
          rows: [priceRow(planted.modelSlug)],
        }),
      );

      await expect(
        recordSourceCheck(
          tx,
          parsedCheck({
            sourceId: planted.sourceId,
            labSlug: planted.labSlug,
            fetchedAt: EARLIER,
            rows: [priceRow(planted.modelSlug, "2")],
          }),
        ),
      ).rejects.toThrow(/earlier than the latest observation/);

      expect(await logsFor(tx, planted.sourceId)).toHaveLength(1);
      expect(await observationCount(tx, planted.sourceId)).toBe(1);
    });
  });

  it("throws when a failed check has a blank note and writes no log", async () => {
    await withEvidence(async (tx) => {
      const planted = await plantCatalog(tx);

      await expect(
        recordSourceCheck(tx, {
          sourceId: planted.sourceId,
          labSlug: planted.labSlug,
          fetchedAt: FIRST_SEEN,
          httpStatus: null,
          result: { kind: "fetch_error", note: "   " },
        }),
      ).rejects.toThrow(/a failed check needs a note/);

      expect(await logsFor(tx, planted.sourceId)).toHaveLength(0);
    });
  });

  it("throws when a model has two global offerings and writes no log", async () => {
    await withEvidence(async (tx) => {
      const planted = await plantCatalog(tx);
      const catalog = createCatalogRepository(tx);
      await catalog.insertOffering({
        modelId: planted.modelId,
        platform: "other-host",
        region: "global",
      });

      await expect(
        recordSourceCheck(tx, {
          sourceId: planted.sourceId,
          labSlug: planted.labSlug,
          fetchedAt: FIRST_SEEN,
          httpStatus: null,
          result: { kind: "fetch_error", note: "network down" },
        }),
      ).rejects.toThrow(/has 2 global offerings/);

      expect(await logsFor(tx, planted.sourceId)).toHaveLength(0);
    });
  });

  it("throws when a model has no global offering and writes no log", async () => {
    await withEvidence(async (tx) => {
      const planted = await plantCatalog(tx, { offering: false });

      await expect(
        recordSourceCheck(tx, {
          sourceId: planted.sourceId,
          labSlug: planted.labSlug,
          fetchedAt: FIRST_SEEN,
          httpStatus: 200,
          result: { kind: "parser_suspect", note: "0 matching tables" },
        }),
      ).rejects.toThrow(/has no global offerings/);

      expect(await logsFor(tx, planted.sourceId)).toHaveLength(0);
    });
  });

  it("throws when the source does not exist", async () => {
    await withEvidence(async (tx) => {
      const planted = await plantCatalog(tx);
      await expect(
        recordSourceCheck(tx, {
          sourceId: missingId,
          labSlug: planted.labSlug,
          fetchedAt: FIRST_SEEN,
          httpStatus: null,
          result: { kind: "fetch_error", note: "network down" },
        }),
      ).rejects.toThrow(new RegExp(`source ${missingId} does not exist`));
    });
  });

  it("throws when the lab does not exist and writes no log", async () => {
    await withEvidence(async (tx) => {
      const planted = await plantCatalog(tx);
      const missingLab = uniqueSlug("missing-lab");

      await expect(
        recordSourceCheck(tx, {
          sourceId: planted.sourceId,
          labSlug: missingLab,
          fetchedAt: FIRST_SEEN,
          httpStatus: null,
          result: { kind: "fetch_error", note: "network down" },
        }),
      ).rejects.toThrow(new RegExp(`lab ${missingLab} does not exist`));

      expect(await logsFor(tx, planted.sourceId)).toHaveLength(0);
    });
  });

  it("throws when a parsed check has no HTTP status and writes no log", async () => {
    await withEvidence(async (tx) => {
      const planted = await plantCatalog(tx);

      await expect(
        recordSourceCheck(
          tx,
          parsedCheck({
            sourceId: planted.sourceId,
            labSlug: planted.labSlug,
            fetchedAt: FIRST_SEEN,
            rows: [priceRow(planted.modelSlug)],
            httpStatus: null,
          }),
        ),
      ).rejects.toThrow(/needs an HTTP status/);

      expect(await logsFor(tx, planted.sourceId)).toHaveLength(0);
    });
  });

  it("throws when a parsed check is outside HTTP 200-299 and writes no log", async () => {
    await withEvidence(async (tx) => {
      const planted = await plantCatalog(tx);

      await expect(
        recordSourceCheck(
          tx,
          parsedCheck({
            sourceId: planted.sourceId,
            labSlug: planted.labSlug,
            fetchedAt: FIRST_SEEN,
            rows: [priceRow(planted.modelSlug)],
            httpStatus: 403,
          }),
        ),
      ).rejects.toThrow(/needs HTTP 200-299, got 403/);

      expect(await logsFor(tx, planted.sourceId)).toHaveLength(0);
    });
  });

  it("throws when a parsed row does not match the price shape and writes no log", async () => {
    await withEvidence(async (tx) => {
      const planted = await plantCatalog(tx);

      await expect(
        recordSourceCheck(
          tx,
          parsedCheck({
            sourceId: planted.sourceId,
            labSlug: planted.labSlug,
            fetchedAt: FIRST_SEEN,
            rows: [{ ...priceRow(planted.modelSlug), modelSlug: "" }],
          }),
        ),
      ).rejects.toThrow(/parsed price row 1 does not match the price shape/);

      expect(await logsFor(tx, planted.sourceId)).toHaveLength(0);
    });
  });

  it("throws when an amount is not a plain decimal and writes no log", async () => {
    await withEvidence(async (tx) => {
      const planted = await plantCatalog(tx);

      await expect(
        recordSourceCheck(
          tx,
          parsedCheck({
            sourceId: planted.sourceId,
            labSlug: planted.labSlug,
            fetchedAt: FIRST_SEEN,
            rows: [priceRow(planted.modelSlug, "nope")],
          }),
        ),
      ).rejects.toThrow(/unreadable price amount/);

      expect(await logsFor(tx, planted.sourceId)).toHaveLength(0);
      expect(await observationCount(tx, planted.sourceId)).toBe(0);
    });
  });

  it("throws when the raw page is blank and writes no log", async () => {
    await withEvidence(async (tx) => {
      const planted = await plantCatalog(tx);

      await expect(
        recordSourceCheck(
          tx,
          parsedCheck({
            sourceId: planted.sourceId,
            labSlug: planted.labSlug,
            fetchedAt: FIRST_SEEN,
            rows: [priceRow(planted.modelSlug)],
            rawContent: "  ",
          }),
        ),
      ).rejects.toThrow(/raw content is empty/);

      expect(await logsFor(tx, planted.sourceId)).toHaveLength(0);
    });
  });

  it("throws when warnings are not strings and writes no log", async () => {
    await withEvidence(async (tx) => {
      const planted = await plantCatalog(tx);
      const input = parsedCheck({
        sourceId: planted.sourceId,
        labSlug: planted.labSlug,
        fetchedAt: FIRST_SEEN,
        rows: [priceRow(planted.modelSlug)],
      });

      await expect(
        recordSourceCheck(tx, {
          ...input,
          result: {
            kind: "parsed",
            rawContent: "pricing page",
            rows: [priceRow(planted.modelSlug)],
            warnings: [1] as unknown as string[],
          },
        }),
      ).rejects.toThrow(/warnings must be a list of strings/);

      expect(await logsFor(tx, planted.sourceId)).toHaveLength(0);
    });
  });

  it("throws when fetchedAt is not a real time and writes no log", async () => {
    await withEvidence(async (tx) => {
      const planted = await plantCatalog(tx);

      await expect(
        recordSourceCheck(
          tx,
          parsedCheck({
            sourceId: planted.sourceId,
            labSlug: planted.labSlug,
            fetchedAt: new Date("not-a-date"),
            rows: [priceRow(planted.modelSlug)],
          }),
        ),
      ).rejects.toThrow(/fetchedAt is not a real time/);

      expect(await logsFor(tx, planted.sourceId)).toHaveLength(0);
    });
  });

  it("throws when the source id is not a positive whole number", async () => {
    await withEvidence(async (tx) => {
      const planted = await plantCatalog(tx);
      await expect(
        recordSourceCheck(tx, {
          sourceId: 0,
          labSlug: planted.labSlug,
          fetchedAt: FIRST_SEEN,
          httpStatus: null,
          result: { kind: "fetch_error", note: "network down" },
        }),
      ).rejects.toThrow(/source id must be a positive whole number/);
    });
  });

  async function withEvidence(run: (tx: EvidenceDb) => Promise<void>): Promise<void> {
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

const missingId = Number.MAX_SAFE_INTEGER;

class RolledBack extends Error {
  constructor() {
    super("evidence test rolled back");
    this.name = "RolledBack";
  }
}

function uniqueSlug(prefix: string): string {
  return `${prefix}-${randomUUID()}`;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function priceRow(
  modelSlug: string,
  amount = "1",
  dimension: NormalizedPrice["dimension"] = "input",
): NormalizedPrice {
  return {
    provider: "openai",
    modelName: "Example Model",
    modelSlug,
    dimension,
    usdPer1M: amount,
    source: "official",
  };
}

function parsedCheck(input: {
  sourceId: number;
  labSlug: string;
  fetchedAt: Date;
  rows: NormalizedPrice[];
  warnings?: string[];
  rawContent?: string;
  httpStatus?: number | null;
}): RecordSourceCheckInput {
  return {
    sourceId: input.sourceId,
    labSlug: input.labSlug,
    fetchedAt: input.fetchedAt,
    httpStatus: input.httpStatus === undefined ? 200 : input.httpStatus,
    result: {
      kind: "parsed",
      rawContent: input.rawContent ?? "pricing page",
      rows: input.rows,
      warnings: input.warnings ?? [],
    },
  };
}

type Planted = {
  sourceId: number;
  labSlug: string;
  modelId: number;
  modelSlug: string;
  offeringId: number | null;
};

async function plantCatalog(
  tx: EvidenceDb,
  options: { offering?: boolean } = {},
): Promise<Planted> {
  const catalog = createCatalogRepository(tx);
  const labSlug = uniqueSlug("lab");
  const modelSlug = uniqueSlug("model");
  const lab = await catalog.insertLab({ name: "Example Lab", slug: labSlug });
  const model = await catalog.insertModel({
    labId: lab.id,
    name: "Example Model",
    slug: modelSlug,
  });
  const offering =
    options.offering === false
      ? null
      : await catalog.insertOffering({ modelId: model.id, platform: "official-api" });
  const source = requireInsertedRow(
    await tx
      .insert(sources)
      .values({
        url: `https://example.test/pricing/${uniqueSlug("page")}`,
        type: "official",
      })
      .returning(),
    "insert source",
  );

  return {
    sourceId: source.id,
    labSlug,
    modelId: model.id,
    modelSlug,
    offeringId: offering?.id ?? null,
  };
}

async function logsFor(tx: EvidenceDb, sourceId: number) {
  return tx
    .select()
    .from(fetchLog)
    .where(eq(fetchLog.sourceId, sourceId))
    .orderBy(asc(fetchLog.id));
}

async function observationCount(tx: EvidenceDb, sourceId: number): Promise<number> {
  const rows = await tx
    .select({ id: observations.id })
    .from(observations)
    .where(eq(observations.sourceId, sourceId));
  return rows.length;
}

async function priceCount(tx: EvidenceDb, offeringId: number | null): Promise<number> {
  if (offeringId === null) {
    return 0;
  }
  const rows = await tx
    .select({ id: priceVersions.id })
    .from(priceVersions)
    .where(eq(priceVersions.offeringId, offeringId));
  return rows.length;
}
