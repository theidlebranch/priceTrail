// @vitest-environment node

/**
 * The checker tests do not open a database. A wrong list must throw before
 * any insert. The Neon tests skip when DATABASE_URL is missing, which is
 * what CI does. They roll the transaction back, so a passing run leaves
 * no rows. Each publish is several round trips, so those tests allow 30
 * seconds.
 *
 * Local run:
 * node --env-file=.env ./node_modules/vitest/vitest.mjs run src/server/db/seed.test.ts
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { parseAnthropicPricing } from "@/core/pricing/anthropic";
import { parseOpenAiPricing } from "@/core/pricing/openai";
import { pricePrecisionLabel } from "@/core/pricing/precision";
import { createDb } from "@/server/db/client";
import {
  fetchLog,
  labs,
  models,
  observationItems,
  observations,
  offerings,
  priceComponents,
  priceVersions,
  sources,
} from "@/server/db/schema";
import { SEED_FIRST_SEEN_AT, SEED_LABS, type SeedModelSpec } from "@/server/db/seed-data";
import {
  assertSeedMatchesRows,
  loadSeedPlan,
  redactDatabaseUrl,
  runSeed,
  type SeedPlanEntry,
} from "@/server/db/seed";
import { parseDatabaseEnv } from "@/server/env";

const databaseUrl = process.env.DATABASE_URL?.trim() ?? "";

describe("hand-checked seed list", () => {
  it("matches the parsers for the six current models", () => {
    const plan = loadSeedPlan();

    expect(plan.map((entry) => entry.lab.slug)).toEqual(["anthropic", "openai"]);
    expect(slugs(plan)).toEqual([
      "claude-fable-5.1",
      "claude-mythos-5.1",
      "gpt-6-astra",
      "gpt-6.1-sol",
      "gpt-6-luna",
      "gpt-6-sol",
    ]);

    expect(model(plan, "claude-fable-5.1")).toMatchObject({
      name: "Claude Fable 5.1",
      components: [
        { dimension: "input", amount: "10" },
        { dimension: "cache_write_5m", amount: "12.5" },
        { dimension: "cache_write_1h", amount: "20" },
        { dimension: "cache_read", amount: "0.25" },
        { dimension: "output", amount: "50" },
      ],
    });
    expect(model(plan, "claude-mythos-5.1").components).toEqual(
      model(plan, "claude-fable-5.1").components,
    );
    expect(model(plan, "gpt-6-astra").components).toEqual([
      { dimension: "input", amount: "10" },
      { dimension: "cache_read", amount: "1" },
      { dimension: "cache_write", amount: "12.5" },
      { dimension: "output", amount: "50" },
    ]);
    expect(model(plan, "gpt-6.1-sol").components).toEqual([
      { dimension: "input", amount: "2" },
      { dimension: "cache_read", amount: "0.1" },
      { dimension: "cache_write", amount: "2.5" },
      { dimension: "output", amount: "10" },
    ]);
    expect(model(plan, "gpt-6-luna").components).toEqual([
      { dimension: "input", amount: "0.1" },
      { dimension: "cache_read", amount: "0.01" },
      { dimension: "cache_write", amount: "0.125" },
      { dimension: "output", amount: "0.5" },
    ]);
    expect(model(plan, "gpt-6-sol").components).toEqual([
      { dimension: "input", amount: "2" },
      { dimension: "cache_read", amount: "0.2" },
      { dimension: "cache_write", amount: "2.5" },
      { dimension: "output", amount: "10" },
    ]);

    const openai = plan.find((entry) => entry.lab.slug === "openai");
    const astraRows = openai?.parsedData.rows.filter((row) => row.modelSlug === "gpt-6-astra") ?? [];
    expect(openai?.parsedData.warnings.some((warning) => /needs_threshold/.test(warning))).toBe(
      true,
    );
    expect(astraRows.some((row) => row.usdPer1M === "20")).toBe(false);
    expect(astraRows.every((row) => row.condition === undefined)).toBe(true);
  });

  it("throws when a hand-checked amount disagrees with the parser", () => {
    const anthropic = SEED_LABS.find((lab) => lab.slug === "anthropic");
    if (anthropic === undefined) {
      throw new Error("anthropic lab missing from the seed list");
    }
    const fable = anthropic.models.find((item) => item.slug === "claude-fable-5.1");
    if (fable === undefined) {
      throw new Error("claude-fable-5.1 missing from the seed list");
    }

    const broken: SeedModelSpec = {
      slug: fable.slug,
      components: fable.components.map((component) =>
        component.dimension === "input" ? { ...component, amount: "11" } : component,
      ),
    };

    expect(() => assertSeedMatchesRows([broken], rowsFor("anthropic"))).toThrow(
      /claude-fable-5.1 does not match/,
    );
  });

  it("throws when the list includes a retired model", () => {
    const retired: SeedModelSpec = {
      slug: "claude-opus-4.1",
      components: [{ dimension: "input", amount: "15" }],
    };

    expect(() => assertSeedMatchesRows([retired], rowsFor("anthropic"))).toThrow(/retired/);
  });

  it("throws when the list includes a long-context amount the parser did not emit", () => {
    const openai = SEED_LABS.find((lab) => lab.slug === "openai");
    const astra = openai?.models.find((item) => item.slug === "gpt-6-astra");
    if (astra === undefined) {
      throw new Error("gpt-6-astra missing from the seed list");
    }

    const withLongContext: SeedModelSpec = {
      slug: astra.slug,
      components: [...astra.components, { dimension: "input", amount: "20" }],
    };

    expect(() => assertSeedMatchesRows([withLongContext], rowsFor("openai"))).toThrow(
      /gpt-6-astra does not match/,
    );
  });

  it("throws when the same model is listed twice", () => {
    const anthropic = SEED_LABS.find((lab) => lab.slug === "anthropic");
    const fable = anthropic?.models.find((item) => item.slug === "claude-fable-5.1");
    if (fable === undefined) {
      throw new Error("claude-fable-5.1 missing from the seed list");
    }

    expect(() => assertSeedMatchesRows([fable, fable], rowsFor("anthropic"))).toThrow(
      /listed twice/,
    );
  });

  it("throws when a listed model has a token tier", () => {
    expect(() =>
      assertSeedMatchesRows([{ slug: "example", components: [{ dimension: "input", amount: "1" }] }], [
        {
          provider: "openai",
          modelName: "example",
          modelSlug: "example",
          dimension: "input",
          usdPer1M: "1",
          condition: { promptTokensUnder: 272000 },
          source: "official",
        },
      ]),
    ).toThrow(/not a single current price/);
  });
});

describe("redactDatabaseUrl", () => {
  it("hides a postgres URL and leaves the rest of the message", () => {
    const message = "connect failed: postgresql://user:secret@db.example/price_trail extra";

    expect(redactDatabaseUrl(message)).toBe("connect failed: postgresql://[redacted] extra");
    expect(redactDatabaseUrl(message)).not.toContain("secret");
  });
});

describe.skipIf(databaseUrl.length === 0)("runSeed", () => {
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

  it("publishes one current price for each of the six models", async () => {
    await withSeed(async (tx) => {
      const plan = loadSeedPlan();
      const result = await runSeed(tx);

      expect(result).toEqual({ labs: 2, models: 6, offerings: 6, priceVersions: 6 });

      const labRows = await tx.select().from(labs).where(inArray(labs.slug, ["anthropic", "openai"]));
      expect(labRows.map((lab) => lab.slug).sort()).toEqual(["anthropic", "openai"]);

      const modelRows = await tx
        .select()
        .from(models)
        .where(inArray(models.labId, labRows.map((lab) => lab.id)));
      expect(modelRows.map((model) => model.slug).sort()).toEqual([...slugs(plan)].sort());

      const offeringRows = await tx
        .select()
        .from(offerings)
        .where(inArray(offerings.modelId, modelRows.map((model) => model.id)));
      expect(offeringRows).toHaveLength(6);
      expect(offeringRows.every((offering) => offering.platform === "official-api")).toBe(true);
      expect(offeringRows.every((offering) => offering.region === "global")).toBe(true);

      const sourceRows = await tx
        .select()
        .from(sources)
        .where(inArray(sources.url, plan.map((entry) => entry.lab.sourceUrl)));
      expect(sourceRows).toHaveLength(2);
      expect(sourceRows.every((source) => source.type === "official" && source.lastCheckedAt === null)).toBe(
        true,
      );

      const observationRows = await tx
        .select()
        .from(observations)
        .where(inArray(observations.sourceId, sourceRows.map((source) => source.id)));
      expect(observationRows).toHaveLength(2);
      for (const observation of observationRows) {
        const entry = plan.find((item) =>
          sourceRows.some((source) => source.id === observation.sourceId && source.url === item.lab.sourceUrl),
        );
        if (entry === undefined) {
          throw new Error("observation does not match a seed lab");
        }
        expect(observation.rawContent).toBe(entry.rawContent);
        expect(observation.rawContentHash).toBe(sha256(entry.rawContent));
        expect(observation.contentHash).toBe(sha256(JSON.stringify(entry.parsedData)));
        expect(observation.archiveUrl).toBeNull();
        expect(observation.archiveStatus).toBe("pending");
        expect(observation.fetchedAt).toEqual(SEED_FIRST_SEEN_AT);
      }

      const itemRows = await tx
        .select()
        .from(observationItems)
        .where(inArray(observationItems.observationId, observationRows.map((observation) => observation.id)));
      expect(itemRows).toHaveLength(6);
      expect(itemRows.every((item) => item.reviewStatus === "confirmed" && item.reviewedBy === "seed")).toBe(
        true,
      );
      expect(itemRows.every((item) => item.reviewedAt?.getTime() === SEED_FIRST_SEEN_AT.getTime())).toBe(
        true,
      );

      const logRows = await tx
        .select()
        .from(fetchLog)
        .where(inArray(fetchLog.sourceId, sourceRows.map((source) => source.id)));
      expect(logRows).toHaveLength(0);

      const versionRows = await tx
        .select()
        .from(priceVersions)
        .where(inArray(priceVersions.offeringId, offeringRows.map((offering) => offering.id)));
      expect(versionRows).toHaveLength(6);
      for (const version of versionRows) {
        expect(version.lastSeenAt).toBeNull();
        expect(version.announcedOn).toBeNull();
        expect(version.retractedAt).toBeNull();
        expect(version.replacesVersionId).toBeNull();
        expect(version.firstSeenAt).toEqual(SEED_FIRST_SEEN_AT);
        expect(pricePrecisionLabel({ firstSeenAt: version.firstSeenAt, announcedOn: version.announcedOn })).toEqual({
          kind: "observed",
          chartStart: "2026-10-18",
          wording: "changed on or before",
        });

        const offering = offeringRows.find((item) => item.id === version.offeringId);
        const storedModel = modelRows.find((item) => item.id === offering?.modelId);
        const expected = model(plan, storedModel?.slug ?? "");
        const amounts = await tx
          .select()
          .from(priceComponents)
          .where(eq(priceComponents.priceVersionId, version.id));
        expect(priced(amounts)).toEqual(
          priced(
            expected.components.map((component) => ({
              dimension: component.dimension,
              amount: component.amount,
            })),
          ),
        );
      }
    });
  }, 30_000);

  it("throws when the anthropic lab already exists and does not open another price", async () => {
    await withSeed(async (tx) => {
      await runSeed(tx);
      const labRows = await tx.select().from(labs).where(eq(labs.slug, "anthropic"));
      const modelRows = await tx
        .select()
        .from(models)
        .where(inArray(models.labId, labRows.map((lab) => lab.id)));
      const offeringRows = await tx
        .select()
        .from(offerings)
        .where(inArray(offerings.modelId, modelRows.map((model) => model.id)));
      const before = await tx
        .select({ id: priceVersions.id })
        .from(priceVersions)
        .where(inArray(priceVersions.offeringId, offeringRows.map((offering) => offering.id)));

      await expect(runSeed(tx)).rejects.toThrow(/anthropic already exists/);

      const after = await tx
        .select({ id: priceVersions.id })
        .from(priceVersions)
        .where(inArray(priceVersions.offeringId, offeringRows.map((offering) => offering.id)));
      expect(after).toEqual(before);
    });
  }, 30_000);

  async function withSeed(run: (tx: Parameters<typeof runSeed>[0]) => Promise<void>): Promise<void> {
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
    super("seed test rolled back");
    this.name = "RolledBack";
  }
}

function rowsFor(labSlug: "anthropic" | "openai") {
  const lab = SEED_LABS.find((item) => item.slug === labSlug);
  if (lab === undefined) {
    throw new Error(`${labSlug} lab missing from the seed list`);
  }
  const rawContent = readFileSync(lab.fixturePath, "utf8");
  const parsed =
    labSlug === "anthropic" ? parseAnthropicPricing(rawContent) : parseOpenAiPricing(rawContent);
  return parsed.rows;
}

function slugs(plan: SeedPlanEntry[]): string[] {
  return plan.flatMap((entry) => entry.models.map((item) => item.slug));
}

function model(plan: SeedPlanEntry[], slug: string) {
  const found = plan.flatMap((entry) => entry.models).find((item) => item.slug === slug);
  if (found === undefined) {
    throw new Error(`seed plan is missing ${slug}`);
  }
  return found;
}

function priced(
  components: { dimension: string; amount: string; condition?: unknown }[],
): { dimension: string; amount: string; condition: unknown }[] {
  return components
    .map((component) => ({
      dimension: component.dimension,
      amount: component.amount,
      condition: component.condition ?? {},
    }))
    .sort((left, right) => left.dimension.localeCompare(right.dimension));
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
