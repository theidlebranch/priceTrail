// @vitest-environment node

/**
 * These tests talk to Neon. They skip when DATABASE_URL is missing, which
 * is what CI does. Each database test rolls its transaction back, so a
 * passing run leaves no rows.
 *
 * The database may already have sources. The assertions look at the rows
 * this test planted, not at an empty catalog.
 *
 * Local run:
 * node --env-file=.env ./node_modules/vitest/vitest.mjs run src/server/db/repositories/source-health.test.ts
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb } from "@/server/db/client";
import type { PublishDb } from "@/server/db/publish-price-version";
import { requireInsertedRow } from "@/server/db/repositories/catalog";
import {
  assembleSourceCheck,
  assembleSourceHealthRow,
  findSource,
  hasSource,
  listRecentSourceChecks,
  listSourceCheckPage,
  listSourceHealth,
  listSourceObservationRefs,
  readSourceHealthStats,
  SOURCE_CHECK_PAGE_SIZE,
} from "@/server/db/repositories/source-health";
import { fetchLog, observations, sources } from "@/server/db/schema";
import { parseDatabaseEnv } from "@/server/env";

const databaseUrl = process.env.DATABASE_URL?.trim() ?? "";
const OLDER = new Date("2026-11-01T00:00:00.000Z");
const NEWER = new Date("2026-11-07T12:00:00.000Z");

const MIDDLE = new Date("2026-11-04T08:00:00.000Z");

describe("assembleSourceHealthRow", () => {
  it("throws when a joined check is missing its outcome or its time", () => {
    expect(() =>
      assembleSourceHealthRow({
        id: 1,
        url: "https://example.test/health/partial",
        type: "official",
        active: true,
        lastCheckedAt: NEWER,
        checks: [
          {
            id: 2,
            outcome: "unchanged",
            fetchedAt: null,
            httpStatus: 200,
            note: null,
            observationId: null,
            archiveStatus: null,
            archiveUrl: null,
          },
        ],
        snapshotId: null,
        snapshotArchiveStatus: null,
        snapshotArchiveUrl: null,
        snapshotFetchedAt: null,
        latestChangeAt: null,
      }),
    ).toThrow(/latest check/);
  });

  it("throws when a snapshot id arrives without a status or a time", () => {
    expect(() =>
      assembleSourceHealthRow({
        id: 1,
        url: "https://example.test/health/partial-snapshot",
        type: "official",
        active: true,
        lastCheckedAt: null,
        checks: [],
        snapshotId: 9,
        snapshotArchiveStatus: null,
        snapshotArchiveUrl: null,
        snapshotFetchedAt: null,
        latestChangeAt: null,
      }),
    ).toThrow(/snapshot/);
  });
});

describe("assembleSourceCheck", () => {
  it("throws when a changed visit has no snapshot", () => {
    expect(() =>
      assembleSourceCheck({
        id: 4,
        fetchedAt: NEWER,
        httpStatus: 200,
        outcome: "changed",
        note: null,
        observationId: null,
        archiveStatus: null,
        archiveUrl: null,
      }),
    ).toThrow(/snapshot/);
  });

  it("throws when a visit that did not change points at a snapshot", () => {
    expect(() =>
      assembleSourceCheck({
        id: 5,
        fetchedAt: NEWER,
        httpStatus: 200,
        outcome: "unchanged",
        note: null,
        observationId: 9,
        archiveStatus: "archived",
        archiveUrl: "https://web.archive.org/web/example",
      }),
    ).toThrow(/snapshot/);
  });
});

describe.skipIf(databaseUrl.length === 0)("source health reads", () => {
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

  it("reads each ending and leaves the page text out", async () => {
    await withHealth(async (tx) => {
      const prefix = `https://example.test/health/${randomUUID()}`;
      const rawMarker = `SECRET-RAW-${randomUUID()}`;
      const parsedMarker = `SECRET-PARSED-${randomUUID()}`;

      await plantSource(tx, `${prefix}/none`);
      await plantSource(tx, `${prefix}/unchanged`, {
        lastCheckedAt: NEWER,
        check: { fetchedAt: NEWER, httpStatus: 200, outcome: "unchanged", note: null },
      });
      await plantSource(tx, `${prefix}/error`, {
        lastCheckedAt: NEWER,
        check: { fetchedAt: NEWER, httpStatus: null, outcome: "fetch_error", note: "network down" },
      });
      await plantSource(tx, `${prefix}/suspect`, {
        lastCheckedAt: NEWER,
        check: {
          fetchedAt: NEWER,
          httpStatus: 200,
          outcome: "parser_suspect",
          note: "0 matching tables",
        },
      });
      await plantSource(tx, `${prefix}/changed`, {
        lastCheckedAt: NEWER,
        snapshots: [
          { fetchedAt: OLDER, archiveStatus: "archived", rawMarker, parsedMarker },
          { fetchedAt: NEWER, archiveStatus: "failed", rawMarker, parsedMarker },
          { fetchedAt: OLDER, archiveStatus: "pending", rawMarker, parsedMarker },
        ],
        checks: [
          { fetchedAt: OLDER, httpStatus: 200, outcome: "unchanged", note: "old check" },
          {
            fetchedAt: NEWER,
            httpStatus: 200,
            outcome: "changed",
            note: "new check",
            snapshot: "newer",
          },
        ],
      });

      const listed = (await listSourceHealth(tx)).filter((row) => row.url.startsWith(prefix));
      const byUrl = new Map(listed.map((row) => [row.url, row]));

      expect(byUrl.get(`${prefix}/none`)).toMatchObject({
        type: "official",
        active: true,
        lastCheckedAt: null,
        checks: [],
        latestSnapshot: null,
        latestChangeAt: null,
      });
      expect(byUrl.get(`${prefix}/unchanged`)).toMatchObject({
        lastCheckedAt: NEWER,
        checks: [{ outcome: "unchanged", fetchedAt: NEWER, httpStatus: 200, note: null }],
        latestSnapshot: null,
        latestChangeAt: null,
      });
      expect(byUrl.get(`${prefix}/error`)).toMatchObject({
        checks: [
          {
            outcome: "fetch_error",
            fetchedAt: NEWER,
            httpStatus: null,
            note: "network down",
          },
        ],
        latestSnapshot: null,
        latestChangeAt: null,
      });
      expect(byUrl.get(`${prefix}/suspect`)).toMatchObject({
        checks: [
          {
            outcome: "parser_suspect",
            fetchedAt: NEWER,
            httpStatus: 200,
            note: "0 matching tables",
          },
        ],
        latestSnapshot: null,
        latestChangeAt: null,
      });
      expect(byUrl.get(`${prefix}/changed`)).toMatchObject({
        lastCheckedAt: NEWER,
        latestSnapshot: { archiveStatus: "failed", archiveUrl: null, fetchedAt: NEWER },
        latestChangeAt: NEWER,
      });
      expect(byUrl.get(`${prefix}/changed`)?.checks.map((item) => item.note)).toEqual([
        "new check",
        "old check",
      ]);

      const packed = JSON.stringify(listed);
      expect(packed).not.toContain(rawMarker);
      expect(packed).not.toContain(parsedMarker);
    });
  });

  it("keeps the later check, and the higher id when the times match", async () => {
    await withHealth(async (tx) => {
      const prefix = `https://example.test/health/${randomUUID()}`;
      await plantSource(tx, `${prefix}/tie`, {
        lastCheckedAt: NEWER,
        checks: [
          { fetchedAt: NEWER, httpStatus: 200, outcome: "unchanged", note: "lower id" },
          { fetchedAt: NEWER, httpStatus: 200, outcome: "unchanged", note: "higher id" },
        ],
      });

      const listed = (await listSourceHealth(tx)).filter((row) => row.url === `${prefix}/tie`);
      expect(listed).toHaveLength(1);
      expect(listed[0]?.checks[0]?.note).toBe("higher id");
    });
  });

  it("reads every visit for one source, newest first, and leaves the page text out", async () => {
    await withHealth(async (tx) => {
      const prefix = `https://example.test/health/${randomUUID()}`;
      const rawMarker = `SECRET-RAW-${randomUUID()}`;
      const parsedMarker = `SECRET-PARSED-${randomUUID()}`;
      const archiveUrl = `https://web.archive.org/web/${randomUUID()}`;

      const sourceId = await plantSource(tx, `${prefix}/history`, {
        lastCheckedAt: NEWER,
        snapshots: [
          {
            fetchedAt: OLDER,
            archiveStatus: "archived",
            archiveUrl,
            rawMarker,
            parsedMarker,
          },
          {
            fetchedAt: NEWER,
            archiveStatus: "failed",
            rawMarker,
            parsedMarker,
          },
        ],
        checks: [
          { fetchedAt: OLDER, httpStatus: 200, outcome: "unchanged", note: "quiet old" },
          {
            fetchedAt: OLDER,
            httpStatus: 200,
            outcome: "changed",
            note: "old change",
            snapshot: "older-archived",
          },
          {
            fetchedAt: MIDDLE,
            httpStatus: 200,
            outcome: "parser_suspect",
            note: "0 matching tables",
          },
          { fetchedAt: NEWER, httpStatus: 200, outcome: "unchanged", note: "quiet new" },
          {
            fetchedAt: NEWER,
            httpStatus: 200,
            outcome: "changed",
            note: "new change",
            snapshot: "newer",
          },
        ],
      });
      await plantSource(tx, `${prefix}/other`, {
        lastCheckedAt: NEWER,
        check: { fetchedAt: NEWER, httpStatus: 200, outcome: "unchanged", note: "other source" },
      });

      expect(await hasSource(tx, sourceId)).toBe(true);
      expect(await hasSource(tx, 9_007_199_254_740_991)).toBe(false);
      expect(await findSource(tx, sourceId)).toEqual({
        id: sourceId,
        url: `${prefix}/history`,
        type: "official",
        active: true,
      });
      expect(await findSource(tx, 9_007_199_254_740_991)).toBeNull();

      const listed = (await listSourceHealth(tx)).filter((row) => row.url === `${prefix}/history`);
      expect(listed).toHaveLength(1);
      expect(listed[0]?.id).toBe(sourceId);

      const checks = await listSourceCheckPage(tx, sourceId, null);
      expect(checks.map((check) => check.note)).toEqual([
        "new change",
        "quiet new",
        "0 matching tables",
        "old change",
        "quiet old",
      ]);
      expect(checks[0]).toMatchObject({
        outcome: "changed",
        fetchedAt: NEWER,
        httpStatus: 200,
        archiveStatus: "failed",
        archiveUrl: null,
      });
      expect(checks[0]?.observationId).toEqual(expect.any(Number));
      expect(checks[3]).toMatchObject({
        outcome: "changed",
        fetchedAt: OLDER,
        archiveStatus: "archived",
        archiveUrl,
      });
      expect(checks[4]).toMatchObject({
        outcome: "unchanged",
        observationId: null,
        archiveStatus: null,
        archiveUrl: null,
      });

      const packed = JSON.stringify(checks);
      expect(packed).not.toContain(rawMarker);
      expect(packed).not.toContain(parsedMarker);
      expect(await listSourceCheckPage(tx, 9_007_199_254_740_991, null)).toEqual([]);

      const stats = await readSourceHealthStats(tx, sourceId);
      expect(stats.checkCount).toBe(5);
      expect(stats.okCount).toBe(4);
      expect(stats.pendingCount).toBe(0);
      expect(stats.archivedCount).toBe(1);
      expect(stats.failedCount).toBe(1);
      expect(stats.latestChangeAt).toEqual(NEWER);
      expect(stats.latestChangeObservationId).toBe(checks[0]?.observationId);
      expect(stats.firstCheckAt).toEqual(OLDER);
      expect(stats.firstCheckId).toBe(checks[4]?.id);

      const refs = await listSourceObservationRefs(tx, sourceId);
      expect(refs.map((ref) => ref.archiveStatus)).toEqual(["failed", "archived"]);
      const packedRefs = JSON.stringify(refs);
      expect(packedRefs).not.toContain(rawMarker);
      expect(packedRefs).not.toContain(parsedMarker);
      expect(await listSourceObservationRefs(tx, 9_007_199_254_740_991)).toEqual([]);
    });
  });

  it("orders sources by url", async () => {
    await withHealth(async (tx) => {
      const prefix = `https://example.test/health/${randomUUID()}`;
      await plantSource(tx, `${prefix}/z`);
      await plantSource(tx, `${prefix}/a`);

      const listed = (await listSourceHealth(tx))
        .map((row) => row.url)
        .filter((url) => url.startsWith(prefix));

      expect(listed).toEqual([`${prefix}/a`, `${prefix}/z`]);
    });
  });

  it("keeps the newest 24 checks and still finds an older price change", async () => {
    await withHealth(async (tx) => {
      const prefix = `https://example.test/health/${randomUUID()}`;
      const start = Date.UTC(2026, 10, 8, 0, 0, 0);
      const unchanged = Array.from({ length: 25 }, (_, index) => ({
        fetchedAt: new Date(start + index * 60_000),
        httpStatus: 200 as const,
        outcome: "unchanged" as const,
        note: `step ${index}`,
      }));

      await plantSource(tx, `${prefix}/window`, {
        lastCheckedAt: unchanged[24]?.fetchedAt,
        snapshots: [
          {
            fetchedAt: OLDER,
            archiveStatus: "archived",
            rawMarker: "raw-window",
            parsedMarker: "parsed-window",
          },
        ],
        checks: [
          {
            fetchedAt: OLDER,
            httpStatus: 200,
            outcome: "changed",
            note: "old change",
            snapshot: "older-archived",
          },
          ...unchanged,
        ],
      });

      const listed = (await listSourceHealth(tx)).filter((row) => row.url === `${prefix}/window`);
      expect(listed).toHaveLength(1);
      expect(listed[0]?.checks).toHaveLength(24);
      expect(listed[0]?.checks[0]?.note).toBe("step 24");
      expect(listed[0]?.checks.some((item) => item.note === "step 0")).toBe(false);
      expect(listed[0]?.checks.some((item) => item.note === "old change")).toBe(false);
      expect(listed[0]?.latestChangeAt).toEqual(OLDER);
      expect(listed[0]?.latestSnapshot).toMatchObject({
        archiveStatus: "archived",
        fetchedAt: OLDER,
      });
      expect(JSON.stringify(listed)).not.toContain("raw-window");
      expect(JSON.stringify(listed)).not.toContain("parsed-window");

      const sourceId = listed[0]?.id;
      if (sourceId === undefined) {
        throw new Error("window source was not listed");
      }
      const recent = await listRecentSourceChecks(tx, sourceId);
      expect(recent).toHaveLength(24);
      expect(recent[0]?.note).toBe("step 24");
      expect(recent.some((item) => item.note === "step 0")).toBe(false);
    });
  });

  it("pages with fetched_at and id, including two checks that share a timestamp", async () => {
    await withHealth(async (tx) => {
      const prefix = `https://example.test/health/${randomUUID()}`;
      const sourceId = await plantSource(tx, `${prefix}/cursor`, {
        lastCheckedAt: NEWER,
        checks: [
          { fetchedAt: OLDER, httpStatus: 200, outcome: "unchanged", note: "older" },
          { fetchedAt: NEWER, httpStatus: 200, outcome: "unchanged", note: "lower id" },
          { fetchedAt: NEWER, httpStatus: 200, outcome: "unchanged", note: "higher id" },
        ],
      });

      const first = await listSourceCheckPage(tx, sourceId, null);
      expect(first.map((item) => item.note)).toEqual(["higher id", "lower id", "older"]);
      const newest = first[0];
      if (newest === undefined) {
        throw new Error("cursor page was empty");
      }
      const rest = await listSourceCheckPage(tx, sourceId, {
        fetchedAt: newest.fetchedAt,
        id: newest.id,
      });
      expect(rest.map((item) => item.note)).toEqual(["lower id", "older"]);
    });
  });

  it("returns a full page of 50 and leaves the older check for the next cursor", async () => {
    await withHealth(async (tx) => {
      const prefix = `https://example.test/health/${randomUUID()}`;
      const start = Date.UTC(2026, 0, 1, 0, 0, 0);
      const checks = Array.from({ length: SOURCE_CHECK_PAGE_SIZE + 1 }, (_, index) => ({
        fetchedAt: new Date(start + index * 60_000),
        httpStatus: 200 as const,
        outcome: "unchanged" as const,
        note: `step ${index}`,
      }));
      const sourceId = await plantSource(tx, `${prefix}/page`, {
        lastCheckedAt: checks[SOURCE_CHECK_PAGE_SIZE]?.fetchedAt,
        checks,
      });

      const page = await listSourceCheckPage(tx, sourceId, null);
      expect(page).toHaveLength(SOURCE_CHECK_PAGE_SIZE);
      expect(page[0]?.note).toBe(`step ${SOURCE_CHECK_PAGE_SIZE}`);
      const oldest = page[SOURCE_CHECK_PAGE_SIZE - 1];
      if (oldest === undefined) {
        throw new Error("full page was short");
      }
      expect(oldest.note).toBe("step 1");
      const next = await listSourceCheckPage(tx, sourceId, {
        fetchedAt: oldest.fetchedAt,
        id: oldest.id,
      });
      expect(next.map((item) => item.note)).toEqual(["step 0"]);
    });
  });

  async function withHealth(run: (tx: PublishDb) => Promise<void>): Promise<void> {
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
    super("source health test rolled back");
    this.name = "RolledBack";
  }
}

async function plantSource(
  tx: PublishDb,
  url: string,
  input: {
    lastCheckedAt?: Date;
    check?: CheckInput;
    checks?: CheckInput[];
    snapshots?: SnapshotInput[];
  } = {},
): Promise<number> {
  const source = requireInsertedRow(
    await tx
      .insert(sources)
      .values({ url, type: "official", lastCheckedAt: input.lastCheckedAt ?? null })
      .returning(),
    "insert source",
  );

  const snapshotIds = new Map<string, number>();
  for (const [index, snapshot] of (input.snapshots ?? []).entries()) {
    const observation = requireInsertedRow(
      await tx
        .insert(observations)
        .values({
          sourceId: source.id,
          fetchedAt: snapshot.fetchedAt,
          contentHash: `content-${randomUUID()}`,
          rawContent: snapshot.rawMarker,
          rawContentHash: `raw-${randomUUID()}`,
          parsedData: { marker: snapshot.parsedMarker },
          archiveUrl: snapshot.archiveUrl ?? null,
          archiveStatus: snapshot.archiveStatus,
        })
        .returning({ id: observations.id }),
      "insert observation",
    );
    snapshotIds.set(snapshotKey(snapshot, index), observation.id);
  }

  const checks = input.checks ?? (input.check === undefined ? [] : [input.check]);
  for (const check of checks) {
    const observationId =
      check.snapshot === undefined ? null : snapshotIds.get(check.snapshot) ?? null;
    if (check.snapshot !== undefined && observationId === null) {
      throw new Error(`test snapshot ${check.snapshot} was not planted`);
    }
    requireInsertedRow(
      await tx
        .insert(fetchLog)
        .values({
          sourceId: source.id,
          fetchedAt: check.fetchedAt,
          httpStatus: check.httpStatus,
          outcome: check.outcome,
          observationId,
          note: check.note,
        })
        .returning({ id: fetchLog.id }),
      "insert fetch log",
    );
  }

  return source.id;
}

function snapshotKey(snapshot: SnapshotInput, index: number): string {
  if (snapshot.fetchedAt.getTime() === NEWER.getTime() && snapshot.archiveStatus === "failed") {
    return "newer";
  }
  if (snapshot.fetchedAt.getTime() === OLDER.getTime() && snapshot.archiveStatus === "archived") {
    return "older-archived";
  }
  return `snapshot-${index}`;
}

type CheckInput = {
  fetchedAt: Date;
  httpStatus: number | null;
  outcome: "unchanged" | "changed" | "parser_suspect" | "fetch_error";
  note: string | null;
  snapshot?: string;
};

type SnapshotInput = {
  fetchedAt: Date;
  archiveStatus: "pending" | "archived" | "failed";
  archiveUrl?: string;
  rawMarker: string;
  parsedMarker: string;
};
