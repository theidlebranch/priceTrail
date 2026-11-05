// @vitest-environment node

/**
 * These tests talk to Neon. They skip when DATABASE_URL is missing, which
 * is what CI does. Each database test rolls its transaction back, so a
 * passing run leaves no rows.
 *
 * The archive step stamps an observation that recordSourceCheck() already
 * stored. It does not download the pricing page, and it does not publish
 * a price. A fake fetch stands in for Save Page Now.
 *
 * Local run:
 * node --env-file=.env ./node_modules/vitest/vitest.mjs run src/server/archive/archive-observation.test.ts
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { NormalizedPrice } from "@/core/pricing/shape";
import { archiveObservation } from "@/server/archive/archive-observation";
import { createDb } from "@/server/db/client";
import { createCatalogRepository, requireInsertedRow } from "@/server/db/repositories/catalog";
import {
  recordArchiveResult,
  recordSourceCheck,
  type EvidenceDb,
} from "@/server/db/repositories/evidence";
import { observationItems, observations, priceVersions, sources } from "@/server/db/schema";
import { parseDatabaseEnv } from "@/server/env";
import type { FetchLike } from "@/server/sources/provider-source";

const databaseUrl = process.env.DATABASE_URL?.trim() ?? "";
const FIRST_SEEN = new Date("2026-06-02T16:00:00.000Z");
const JOB_ID = "spn2-eb689466aaf95d8a0a9e21c7b715f7caf3a5b380";
const TIMESTAMP = "20261019182706";
const KEYS = {
  IA_ACCESS_KEY: "access-key-test",
  IA_SECRET_KEY: "secret-key-test",
};

describe.skipIf(databaseUrl.length === 0)("archiveObservation", () => {
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

  it("stores the permalink and leaves the page text and the price alone", async () => {
    await withEvidence(async (tx) => {
      const planted = await plantSnapshot(tx);
      const permalink = waybackPermalink(planted.pageUrl);
      let calls = 0;
      const result = await archiveObservation(tx, {
        observationId: planted.observationId,
        env: KEYS,
        fetchImpl: async (url, init) => {
          calls += 1;
          if (calls === 1) {
            expect(url).toBe("https://web.archive.org/save");
            expect(String(init?.body)).toContain(encodeURIComponent(planted.pageUrl));
            return jsonResponse(200, { url: planted.pageUrl, job_id: JOB_ID });
          }
          return jsonResponse(200, {
            status: "success",
            job_id: JOB_ID,
            timestamp: TIMESTAMP,
            original_url: planted.pageUrl,
          });
        },
        now: () => 0,
        sleep: async () => {},
      });

      expect(result).toEqual({ kind: "archived", permalink });
      await expectUnchangedPage(tx, planted, {
        archiveUrl: permalink,
        archiveStatus: "archived",
      });
      expect(await priceCount(tx, planted.offeringId)).toBe(0);
    });
  });

  it("does not call fetch again when the observation is already archived", async () => {
    await withEvidence(async (tx) => {
      const planted = await plantSnapshot(tx);
      const permalink = waybackPermalink(planted.pageUrl);
      await archiveObservation(tx, {
        observationId: planted.observationId,
        env: KEYS,
        fetchImpl: successFetch(planted.pageUrl),
        now: () => 0,
        sleep: async () => {},
      });

      let calls = 0;
      const again = await archiveObservation(tx, {
        observationId: planted.observationId,
        env: KEYS,
        fetchImpl: async () => {
          calls += 1;
          throw new Error("fetch should not be called");
        },
        now: () => 0,
        sleep: async () => {},
      });

      expect(calls).toBe(0);
      expect(again).toEqual({ kind: "already_archived", permalink });
      await expectUnchangedPage(tx, planted, {
        archiveUrl: permalink,
        archiveStatus: "archived",
      });
    });
  });

  it("tries again after a failed capture", async () => {
    await withEvidence(async (tx) => {
      const planted = await plantSnapshot(tx);
      const first = await archiveObservation(tx, {
        observationId: planted.observationId,
        env: KEYS,
        fetchImpl: async () => new Response("nope", { status: 500 }),
        now: () => 0,
        sleep: async () => {},
      });

      expect(first.kind).toBe("failed");
      await expectUnchangedPage(tx, planted, {
        archiveUrl: null,
        archiveStatus: "failed",
      });

      const permalink = waybackPermalink(planted.pageUrl);
      const second = await archiveObservation(tx, {
        observationId: planted.observationId,
        env: KEYS,
        fetchImpl: successFetch(planted.pageUrl),
        now: () => 0,
        sleep: async () => {},
      });

      expect(second).toEqual({ kind: "archived", permalink });
      await expectUnchangedPage(tx, planted, {
        archiveUrl: permalink,
        archiveStatus: "archived",
      });
    });
  });

  it("marks the archive failed when Wayback reports an error", async () => {
    await withEvidence(async (tx) => {
      const planted = await plantSnapshot(tx);
      const result = await archiveObservation(tx, {
        observationId: planted.observationId,
        env: KEYS,
        fetchImpl: scriptedFetch([
          jsonResponse(200, { url: planted.pageUrl, job_id: JOB_ID }),
          jsonResponse(200, {
            status: "error",
            message: "Couldn't resolve host for http://example5123.com.",
            job_id: JOB_ID,
          }),
        ]),
        now: () => 0,
        sleep: async () => {},
      });

      expect(result.kind).toBe("failed");
      if (result.kind === "failed") {
        expect(result.reason).toMatch(/Couldn't resolve host/);
      }
      await expectUnchangedPage(tx, planted, {
        archiveUrl: null,
        archiveStatus: "failed",
      });
    });
  });

  it("marks the archive failed on HTTP 500 and does not throw", async () => {
    await withEvidence(async (tx) => {
      const planted = await plantSnapshot(tx);
      const result = await archiveObservation(tx, {
        observationId: planted.observationId,
        env: KEYS,
        fetchImpl: async () =>
          new Response(`denied ${KEYS.IA_SECRET_KEY}`, { status: 500 }),
        now: () => 0,
        sleep: async () => {},
      });

      expect(result.kind).toBe("failed");
      if (result.kind === "failed") {
        expect(result.reason).toMatch(/HTTP 500/);
        expect(result.reason).not.toContain(KEYS.IA_SECRET_KEY);
      }
      await expectUnchangedPage(tx, planted, {
        archiveUrl: null,
        archiveStatus: "failed",
      });
      expect(await priceCount(tx, planted.offeringId)).toBe(0);
    });
  });

  it("marks the archive failed when the job stays pending past the time limit", async () => {
    await withEvidence(async (tx) => {
      const planted = await plantSnapshot(tx);
      let clock = 0;
      let calls = 0;
      const result = await archiveObservation(tx, {
        observationId: planted.observationId,
        env: KEYS,
        fetchImpl: async () => {
          calls += 1;
          if (calls === 1) {
            return jsonResponse(200, { url: planted.pageUrl, job_id: JOB_ID });
          }
          return jsonResponse(200, { status: "pending", job_id: JOB_ID });
        },
        now: () => clock,
        sleep: async () => {
          clock += 180_000;
        },
      });

      expect(result.kind).toBe("failed");
      if (result.kind === "failed") {
        expect(result.reason).toMatch(/timed out/i);
      }
      await expectUnchangedPage(tx, planted, {
        archiveUrl: null,
        archiveStatus: "failed",
      });
    });
  }, 2_000);

  it("does not store a permalink when the submit response has no job id", async () => {
    await withEvidence(async (tx) => {
      const planted = await plantSnapshot(tx);
      const result = await archiveObservation(tx, {
        observationId: planted.observationId,
        env: KEYS,
        fetchImpl: async () => jsonResponse(200, { url: planted.pageUrl }),
        now: () => 0,
        sleep: async () => {},
      });

      expect(result.kind).toBe("failed");
      if (result.kind === "failed") {
        expect(result.reason).toMatch(/job_id/);
      }
      await expectUnchangedPage(tx, planted, {
        archiveUrl: null,
        archiveStatus: "failed",
      });
    });
  });

  it("does not store a permalink when success has no timestamp", async () => {
    await withEvidence(async (tx) => {
      const planted = await plantSnapshot(tx);
      const result = await archiveObservation(tx, {
        observationId: planted.observationId,
        env: KEYS,
        fetchImpl: scriptedFetch([
          jsonResponse(200, { url: planted.pageUrl, job_id: JOB_ID }),
          jsonResponse(200, {
            status: "success",
            job_id: JOB_ID,
            original_url: planted.pageUrl,
          }),
        ]),
        now: () => 0,
        sleep: async () => {},
      });

      expect(result.kind).toBe("failed");
      if (result.kind === "failed") {
        expect(result.reason).toMatch(/permalink/i);
      }
      await expectUnchangedPage(tx, planted, {
        archiveUrl: null,
        archiveStatus: "failed",
      });
    });
  });

  it("does not store a permalink when success has no original URL", async () => {
    await withEvidence(async (tx) => {
      const planted = await plantSnapshot(tx);
      const result = await archiveObservation(tx, {
        observationId: planted.observationId,
        env: KEYS,
        fetchImpl: scriptedFetch([
          jsonResponse(200, { url: planted.pageUrl, job_id: JOB_ID }),
          jsonResponse(200, {
            status: "success",
            job_id: JOB_ID,
            timestamp: TIMESTAMP,
          }),
        ]),
        now: () => 0,
        sleep: async () => {},
      });

      expect(result.kind).toBe("failed");
      if (result.kind === "failed") {
        expect(result.reason).toMatch(/permalink/i);
      }
      await expectUnchangedPage(tx, planted, {
        archiveUrl: null,
        archiveStatus: "failed",
      });
    });
  });

  it("throws when the secret key is missing and leaves the row pending", async () => {
    await withEvidence(async (tx) => {
      const planted = await plantSnapshot(tx);
      let calls = 0;

      await expect(
        archiveObservation(tx, {
          observationId: planted.observationId,
          env: { IA_ACCESS_KEY: KEYS.IA_ACCESS_KEY },
          fetchImpl: async () => {
            calls += 1;
            throw new Error("fetch should not be called");
          },
          now: () => 0,
          sleep: async () => {},
        }),
      ).rejects.toThrow(/IA_SECRET_KEY/);

      expect(calls).toBe(0);
      await expectUnchangedPage(tx, planted, {
        archiveUrl: null,
        archiveStatus: "pending",
      });
    });
  });

  it("throws when the observation does not exist and does not call fetch", async () => {
    await withEvidence(async (tx) => {
      let calls = 0;
      await expect(
        archiveObservation(tx, {
          observationId: Number.MAX_SAFE_INTEGER,
          env: KEYS,
          fetchImpl: async () => {
            calls += 1;
            throw new Error("fetch should not be called");
          },
          now: () => 0,
          sleep: async () => {},
        }),
      ).rejects.toThrow(/does not exist/);
      expect(calls).toBe(0);
    });
  });

  it("throws when a row is archived without a permalink", async () => {
    await withEvidence(async (tx) => {
      const planted = await plantSnapshot(tx);
      await tx
        .update(observations)
        .set({ archiveStatus: "archived", archiveUrl: null })
        .where(eq(observations.id, planted.observationId));
      let calls = 0;

      await expect(
        archiveObservation(tx, {
          observationId: planted.observationId,
          env: KEYS,
          fetchImpl: async () => {
            calls += 1;
            throw new Error("fetch should not be called");
          },
          now: () => 0,
          sleep: async () => {},
        }),
      ).rejects.toThrow(/permalink/);

      expect(calls).toBe(0);
      await expect(
        recordArchiveResult(tx, {
          observationId: planted.observationId,
          result: { kind: "failed" },
        }),
      ).rejects.toThrow(/permalink/);
    });
  });

  it("throws when the observation id is not a positive whole number", async () => {
    await withEvidence(async (tx) => {
      let calls = 0;
      await expect(
        archiveObservation(tx, {
          observationId: 0,
          env: KEYS,
          fetchImpl: async () => {
            calls += 1;
            throw new Error("fetch should not be called");
          },
          now: () => 0,
          sleep: async () => {},
        }),
      ).rejects.toThrow(/positive whole number/);
      expect(calls).toBe(0);
    });
  });

  it("refuses a permalink that is not a Wayback URL and leaves the row pending", async () => {
    await withEvidence(async (tx) => {
      const planted = await plantSnapshot(tx);

      await expect(
        recordArchiveResult(tx, {
          observationId: planted.observationId,
          result: { kind: "archived", permalink: "https://example.com/not-wayback" },
        }),
      ).rejects.toThrow(/web\.archive\.org/);

      await expect(
        recordArchiveResult(tx, {
          observationId: planted.observationId,
          result: { kind: "archived", permalink: "  " },
        }),
      ).rejects.toThrow(/permalink/);

      await expectUnchangedPage(tx, planted, {
        archiveUrl: null,
        archiveStatus: "pending",
      });
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

class RolledBack extends Error {
  constructor() {
    super("archive test rolled back");
    this.name = "RolledBack";
  }
}

type PlantedSnapshot = {
  observationId: number;
  offeringId: number;
  pageUrl: string;
  rawContent: string;
};

async function plantSnapshot(tx: EvidenceDb): Promise<PlantedSnapshot> {
  const catalog = createCatalogRepository(tx);
  const labSlug = uniqueSlug("lab");
  const modelSlug = uniqueSlug("model");
  const lab = await catalog.insertLab({ name: "Example Lab", slug: labSlug });
  const model = await catalog.insertModel({
    labId: lab.id,
    name: "Example Model",
    slug: modelSlug,
  });
  const offering = await catalog.insertOffering({
    modelId: model.id,
    platform: "official-api",
  });
  const pageUrl = `https://example.test/pricing/${uniqueSlug("page")}`;
  const source = requireInsertedRow(
    await tx
      .insert(sources)
      .values({ url: pageUrl, type: "official" })
      .returning(),
    "insert source",
  );
  const rawContent = "pricing page body";
  const filed = await recordSourceCheck(tx, {
    sourceId: source.id,
    labSlug,
    fetchedAt: FIRST_SEEN,
    httpStatus: 200,
    result: {
      kind: "parsed",
      rawContent,
      rows: [priceRow(modelSlug)],
      warnings: [],
    },
  });
  if (filed.observationId === null) {
    throw new Error("planted check did not store an observation");
  }
  return {
    observationId: filed.observationId,
    offeringId: offering.id,
    pageUrl,
    rawContent,
  };
}

async function expectUnchangedPage(
  tx: EvidenceDb,
  planted: PlantedSnapshot,
  archive: { archiveUrl: string | null; archiveStatus: "pending" | "archived" | "failed" },
): Promise<void> {
  const stored = await tx
    .select()
    .from(observations)
    .where(eq(observations.id, planted.observationId));
  expect(stored).toHaveLength(1);
  expect(stored[0]).toMatchObject({
    rawContent: planted.rawContent,
    archiveUrl: archive.archiveUrl,
    archiveStatus: archive.archiveStatus,
  });

  const items = await tx
    .select({ reviewStatus: observationItems.reviewStatus })
    .from(observationItems)
    .where(eq(observationItems.observationId, planted.observationId));
  expect(items).toEqual([{ reviewStatus: "flagged" }]);
}

async function priceCount(tx: EvidenceDb, offeringId: number): Promise<number> {
  const rows = await tx
    .select({ id: priceVersions.id })
    .from(priceVersions)
    .where(eq(priceVersions.offeringId, offeringId));
  return rows.length;
}

function successFetch(pageUrl: string): FetchLike {
  return scriptedFetch([
    jsonResponse(200, { url: pageUrl, job_id: JOB_ID }),
    jsonResponse(200, {
      status: "success",
      job_id: JOB_ID,
      timestamp: TIMESTAMP,
      original_url: pageUrl,
    }),
  ]);
}

function scriptedFetch(responses: Response[]): FetchLike {
  const pending = [...responses];
  return async () => {
    const next = pending.shift();
    if (next === undefined) {
      throw new Error("no more scripted responses");
    }
    return next;
  };
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status });
}

function waybackPermalink(pageUrl: string): string {
  return `https://web.archive.org/web/${TIMESTAMP}/${pageUrl}`;
}

function uniqueSlug(prefix: string): string {
  return `${prefix}-${randomUUID()}`;
}

function priceRow(modelSlug: string): NormalizedPrice {
  return {
    provider: "openai",
    modelName: "Example Model",
    modelSlug,
    dimension: "input",
    usdPer1M: "1",
    source: "official",
  };
}
