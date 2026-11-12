// @vitest-environment node

/**
 * These tests talk to Neon. They skip when DATABASE_URL is missing, which
 * is what CI does. Each database test rolls its transaction back, so a
 * passing run leaves no rows.
 *
 * A test passes its own page URLs. The real Google URL is unique, and the
 * live source row may already use it. A fake fetch stands in for Save Page
 * Now. This does not download a pricing page, and it does not publish a price.
 *
 * Local run:
 * node --env-file=.env ./node_modules/vitest/vitest.mjs run src/server/archive/rearchive-google.test.ts
 */
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { rearchiveGoogleMarkdown } from "@/server/archive/rearchive-google";
import { createDb } from "@/server/db/client";
import { type EvidenceDb } from "@/server/db/repositories/evidence";
import { observationItems, observations, sources } from "@/server/db/schema";
import { parseDatabaseEnv } from "@/server/env";
import type { FetchLike } from "@/server/sources/provider-source";

const databaseUrl = process.env.DATABASE_URL?.trim() ?? "";
const OLDER = new Date("2026-11-01T00:00:00.000Z");
const NEWER = new Date("2026-11-12T12:31:04.000Z");
const TIMESTAMP = "20261112140000";
const JOB_ID = "spn2-eb689466aaf95d8a0a9e21c7b715f7caf3a5b380";
const KEYS = {
  IA_ACCESS_KEY: "access-key-test",
  IA_SECRET_KEY: "secret-key-test",
};

describe.skipIf(databaseUrl.length === 0)("rearchiveGoogleMarkdown", () => {
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

  it("replaces the latest permalink and leaves the stored page text", async () => {
    await withRollback(async (tx) => {
      const planted = await plantGoogleSource(tx);
      const permalink = waybackPermalink(planted.markdownUrl, TIMESTAMP);
      let calls = 0;

      const result = await rearchiveGoogleMarkdown(tx, {
        env: KEYS,
        markdownUrl: planted.markdownUrl,
        previousUrls: [planted.htmlUrl],
        fetchImpl: async (url, init) => {
          calls += 1;
          if (calls === 1) {
            expect(url).toBe("https://web.archive.org/save");
            expect(String(init?.body)).toContain(encodeURIComponent(planted.markdownUrl));
            return jsonResponse(200, { url: planted.markdownUrl, job_id: JOB_ID });
          }
          return jsonResponse(200, {
            status: "success",
            job_id: JOB_ID,
            timestamp: TIMESTAMP,
            original_url: planted.markdownUrl,
          });
        },
        now: () => 0,
        sleep: async () => {},
      });

      expect(result).toEqual({
        kind: "archived",
        observationId: planted.latestId,
        permalink,
      });
      expect(calls).toBe(2);
      expect(await sourceUrl(tx, planted.sourceId)).toBe(planted.markdownUrl);
      const stored = await observationRows(tx, planted.sourceId);
      expect(stored).toHaveLength(2);
      expect(stored.find((row) => row.id === planted.latestId)).toMatchObject({
        rawContent: planted.rawContent,
        archiveUrl: permalink,
        archiveStatus: "archived",
      });
      expect(stored.find((row) => row.id === planted.olderId)).toMatchObject({
        archiveUrl: planted.olderPermalink,
        archiveStatus: "archived",
      });
      expect(await itemCount(tx, planted.latestId)).toBe(0);
    });
  });

  it("leaves the old permalink when the capture fails", async () => {
    await withRollback(async (tx) => {
      const planted = await plantGoogleSource(tx);
      const fetchImpl: FetchLike = async () => jsonResponse(500, { status: "error" });

      const result = await rearchiveGoogleMarkdown(tx, {
        env: KEYS,
        markdownUrl: planted.markdownUrl,
        previousUrls: [planted.htmlUrl],
        fetchImpl,
        now: () => 0,
        sleep: async () => {},
      });

      expect(result.kind).toBe("failed");
      expect(await sourceUrl(tx, planted.sourceId)).toBe(planted.markdownUrl);
      const latest = (await observationRows(tx, planted.sourceId)).find(
        (row) => row.id === planted.latestId,
      );
      expect(latest).toMatchObject({
        rawContent: planted.rawContent,
        archiveUrl: planted.latestPermalink,
        archiveStatus: "archived",
      });
    });
  });

  it("does not call Wayback when the latest link already names the markdown page", async () => {
    await withRollback(async (tx) => {
      const planted = await plantGoogleSource(tx, { alreadyMarkdown: true });
      let calls = 0;

      const result = await rearchiveGoogleMarkdown(tx, {
        env: {},
        markdownUrl: planted.markdownUrl,
        previousUrls: [planted.htmlUrl],
        fetchImpl: async () => {
          calls += 1;
          return jsonResponse(500, {});
        },
        now: () => 0,
        sleep: async () => {},
      });

      expect(calls).toBe(0);
      expect(result).toEqual({
        kind: "already_markdown",
        observationId: planted.latestId,
        permalink: waybackPermalink(planted.markdownUrl, TIMESTAMP),
      });
    });
  });

  it("throws when the Google source row is missing", async () => {
    await withRollback(async (tx) => {
      const markdownUrl = `https://example.test/${randomUUID()}.md`;
      await expect(
        rearchiveGoogleMarkdown(tx, {
          env: KEYS,
          markdownUrl,
          previousUrls: [`https://example.test/${randomUUID()}`],
          fetchImpl: async () => jsonResponse(200, {}),
          now: () => 0,
          sleep: async () => {},
        }),
      ).rejects.toThrow(/google official source is missing/);
    });
  });

  it("throws when two Google pricing rows match", async () => {
    await withRollback(async (tx) => {
      const planted = await plantGoogleSource(tx);
      const otherUrl = `https://example.test/${randomUUID()}`;
      await tx.insert(sources).values({ url: otherUrl, type: "official" });

      await expect(
        rearchiveGoogleMarkdown(tx, {
          env: KEYS,
          markdownUrl: planted.markdownUrl,
          previousUrls: [planted.htmlUrl, otherUrl],
          fetchImpl: async () => jsonResponse(200, {}),
          now: () => 0,
          sleep: async () => {},
        }),
      ).rejects.toThrow(/more than one Google pricing source row/);
      expect(await sourceUrl(tx, planted.sourceId)).toBe(planted.htmlUrl);
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
    super("rearchive test rolled back");
    this.name = "RolledBack";
  }
}

type PlantedSource = {
  sourceId: number;
  htmlUrl: string;
  markdownUrl: string;
  latestId: number;
  olderId: number;
  latestPermalink: string;
  olderPermalink: string;
  rawContent: string;
};

async function plantGoogleSource(
  tx: EvidenceDb,
  options: { alreadyMarkdown?: boolean } = {},
): Promise<PlantedSource> {
  const token = randomUUID();
  const htmlUrl = `https://example.test/${token}.html?hl=en`;
  const markdownUrl = `https://example.test/${token}.md?hl=en`;
  const sourceRows = await tx
    .insert(sources)
    .values({ url: options.alreadyMarkdown ? markdownUrl : htmlUrl, type: "official" })
    .returning({ id: sources.id });
  const source = sourceRows[0];
  if (source === undefined) {
    throw new Error("insert source");
  }

  const rawContent = `stored html page ${token}`;
  const olderPermalink = waybackPermalink(htmlUrl, "20261101000000");
  const latestPermalink = options.alreadyMarkdown
    ? waybackPermalink(markdownUrl, TIMESTAMP)
    : waybackPermalink(htmlUrl, "20261112123104");
  const older = await insertObservation(tx, {
    sourceId: source.id,
    fetchedAt: OLDER,
    rawContent: `older page ${token}`,
    archiveUrl: olderPermalink,
  });
  const latest = await insertObservation(tx, {
    sourceId: source.id,
    fetchedAt: NEWER,
    rawContent,
    archiveUrl: latestPermalink,
  });

  return {
    sourceId: source.id,
    htmlUrl,
    markdownUrl,
    latestId: latest,
    olderId: older,
    latestPermalink,
    olderPermalink,
    rawContent,
  };
}

async function insertObservation(
  tx: EvidenceDb,
  input: { sourceId: number; fetchedAt: Date; rawContent: string; archiveUrl: string },
): Promise<number> {
  const rows = await tx
    .insert(observations)
    .values({
      sourceId: input.sourceId,
      fetchedAt: input.fetchedAt,
      contentHash: randomUUID(),
      rawContent: input.rawContent,
      rawContentHash: randomUUID(),
      parsedData: { rows: [], warnings: [] },
      archiveUrl: input.archiveUrl,
      archiveStatus: "archived",
    })
    .returning({ id: observations.id });
  const row = rows[0];
  if (row === undefined) {
    throw new Error("insert observation");
  }
  return row.id;
}

function waybackPermalink(pageUrl: string, timestamp: string): string {
  return `https://web.archive.org/web/${timestamp}/${pageUrl}`;
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function sourceUrl(tx: EvidenceDb, sourceId: number): Promise<string> {
  const rows = await tx
    .select({ url: sources.url })
    .from(sources)
    .where(eq(sources.id, sourceId));
  const row = rows[0];
  if (row === undefined) {
    throw new Error("source disappeared");
  }
  return row.url;
}

async function observationRows(tx: EvidenceDb, sourceId: number) {
  return tx
    .select({
      id: observations.id,
      rawContent: observations.rawContent,
      archiveUrl: observations.archiveUrl,
      archiveStatus: observations.archiveStatus,
    })
    .from(observations)
    .where(eq(observations.sourceId, sourceId));
}

async function itemCount(tx: EvidenceDb, observationId: number): Promise<number> {
  const rows = await tx
    .select({ id: observationItems.id })
    .from(observationItems)
    .where(eq(observationItems.observationId, observationId));
  return rows.length;
}
