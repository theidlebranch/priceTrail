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
import { assembleSourceHealthRow, listSourceHealth } from "@/server/db/repositories/source-health";
import { fetchLog, observations, sources } from "@/server/db/schema";
import { parseDatabaseEnv } from "@/server/env";

const databaseUrl = process.env.DATABASE_URL?.trim() ?? "";
const OLDER = new Date("2026-11-01T00:00:00.000Z");
const NEWER = new Date("2026-11-07T12:00:00.000Z");

describe("assembleSourceHealthRow", () => {
  it("throws when a joined check is missing its outcome or its time", () => {
    expect(() =>
      assembleSourceHealthRow({
        url: "https://example.test/health/partial",
        type: "official",
        active: true,
        lastCheckedAt: NEWER,
        outcome: "unchanged",
        fetchedAt: null,
        httpStatus: 200,
        note: null,
        archiveStatus: null,
      }),
    ).toThrow(/latest check/);
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
        latestCheck: null,
        archiveStatus: null,
      });
      expect(byUrl.get(`${prefix}/unchanged`)).toMatchObject({
        lastCheckedAt: NEWER,
        latestCheck: { outcome: "unchanged", fetchedAt: NEWER, httpStatus: 200, note: null },
        archiveStatus: null,
      });
      expect(byUrl.get(`${prefix}/error`)).toMatchObject({
        latestCheck: {
          outcome: "fetch_error",
          fetchedAt: NEWER,
          httpStatus: null,
          note: "network down",
        },
        archiveStatus: null,
      });
      expect(byUrl.get(`${prefix}/suspect`)).toMatchObject({
        latestCheck: {
          outcome: "parser_suspect",
          fetchedAt: NEWER,
          httpStatus: 200,
          note: "0 matching tables",
        },
        archiveStatus: null,
      });
      expect(byUrl.get(`${prefix}/changed`)).toMatchObject({
        lastCheckedAt: NEWER,
        latestCheck: { outcome: "changed", fetchedAt: NEWER, httpStatus: 200, note: "new check" },
        archiveStatus: "failed",
      });

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
      expect(listed[0]?.latestCheck?.note).toBe("higher id");
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
): Promise<void> {
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
}

function snapshotKey(snapshot: SnapshotInput, index: number): string {
  if (snapshot.fetchedAt.getTime() === NEWER.getTime() && snapshot.archiveStatus === "failed") {
    return "newer";
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
  rawMarker: string;
  parsedMarker: string;
};
