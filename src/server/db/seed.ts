import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { and, eq } from "drizzle-orm";
import { parseAnthropicPricing } from "@/core/pricing/anthropic";
import { parseOpenAiPricing } from "@/core/pricing/openai";
import type { NormalizedPrice } from "@/core/pricing/shape";
import { createCatalogRepository, requireInsertedRow } from "@/server/db/repositories/catalog";
import { publishPriceVersion, type PublishDb } from "@/server/db/publish-price-version";
import { observationItems, observations, sources } from "@/server/db/schema";
import {
  SEED_FIRST_SEEN_AT,
  SEED_LABS,
  type SeedLabSpec,
  type SeedModelSpec,
} from "@/server/db/seed-data";

/**
 * Fill an empty database with the hand-checked current prices.
 *
 * The checker runs before any insert. A retired model, a wrong amount, or
 * a long-context price the parser did not emit throws here, and the
 * database stays unchanged.
 *
 * This file inserts labs, models, offerings, and the evidence row
 * publishPriceVersion() requires. It does not insert price_versions or
 * price_components. That write stays in the publish function.
 * recordSourceCheck() files a live visit and leaves new items flagged.
 * The seed is not a visit. It writes a hand-confirmed item, then publishes,
 * so these observation inserts stay in this file.
 *
 * Each published item is confirmed. ok would mean the cell check passed,
 * and that check does not exist yet. reviewed_by is the word "seed".
 *
 * One extra snapshot is flagged for Claude Mythos 5.1. That row is the
 * example "change under review." It is not passed to publishPriceVersion(),
 * so its amount never becomes a price.
 *
 * There is no fetch_log row. A fetch log is a live visit, and this script
 * only reads the saved fixtures. sources.last_checked_at stays empty.
 *
 * A second run throws when the lab slug is already there. It does not
 * delete rows and it does not open a second current price. The pending
 * example has its own function, so an already-seeded database can gain
 * that one flagged row without publishing again.
 */

const RETIRED_NOTE = /retired/i;
const PENDING_MODEL_SLUG = "claude-mythos-5.1";
const PENDING_FETCHED_AT = new Date("2026-11-01T00:00:00.000Z");
const PENDING_AMOUNT = "999";

export type SeedPlanModel = SeedModelSpec & {
  name: string;
};

export type SeedPlanEntry = {
  lab: SeedLabSpec;
  rawContent: string;
  parsedData: {
    rows: NormalizedPrice[];
    warnings: string[];
  };
  models: SeedPlanModel[];
};

export type SeedResult = {
  labs: number;
  models: number;
  offerings: number;
  priceVersions: number;
};

/**
 * Compare one hand-checked list to parser rows.
 * Tests pass a broken list here on purpose. The real seed uses SEED_LABS.
 */
export function assertSeedMatchesRows(
  models: readonly SeedModelSpec[],
  rows: readonly NormalizedPrice[],
): void {
  const seen = new Set<string>();

  for (const model of models) {
    if (seen.has(model.slug)) {
      throw new Error(`seed model ${model.slug} is listed twice`);
    }
    seen.add(model.slug);

    const parsed = rows.filter((row) => row.modelSlug === model.slug);
    if (parsed.length === 0) {
      throw new Error(`seed model ${model.slug} is not in the parser output`);
    }
    if (parsed.some((row) => row.note !== undefined && RETIRED_NOTE.test(row.note))) {
      throw new Error(`seed model ${model.slug} is retired; refusing to publish`);
    }
    if (
      parsed.some(
        (row) =>
          row.condition !== undefined ||
          row.validFrom !== undefined ||
          row.validUntil !== undefined,
      )
    ) {
      throw new Error(`seed model ${model.slug} is not a single current price`);
    }

    const expected = model.components
      .map((component) => `${component.dimension}\t${component.amount}`)
      .sort();
    const actual = parsed.map((row) => `${row.dimension}\t${row.usdPer1M}`).sort();
    if (expected.length === 0 || expected.join("\n") !== actual.join("\n")) {
      throw new Error(`seed model ${model.slug} does not match the parser`);
    }
  }
}

/** Read the two fixtures, parse them, and refuse a list that does not match. */
export function loadSeedPlan(): SeedPlanEntry[] {
  return SEED_LABS.map((lab) => {
    const rawContent = readFileSync(lab.fixturePath, "utf8");
    const parsed = parseFixture(lab.parser, rawContent);
    assertSeedMatchesRows(lab.models, parsed.rows);

    return {
      lab,
      rawContent,
      parsedData: {
        rows: parsed.rows,
        warnings: parsed.warnings,
      },
      models: lab.models.map((model) => ({
        ...model,
        name: modelName(parsed.rows, model.slug),
      })),
    };
  });
}

export async function runSeed(db: PublishDb): Promise<SeedResult> {
  const plan = loadSeedPlan();

  return db.transaction(async (tx) => {
    const catalog = createCatalogRepository(tx);

    for (const entry of plan) {
      const existing = await catalog.findLabBySlug(entry.lab.slug);
      if (existing !== null) {
        throw new Error(`lab ${entry.lab.slug} already exists; refusing to seed again`);
      }
    }

    let modelCount = 0;
    let offeringCount = 0;
    let priceVersionCount = 0;

    for (const entry of plan) {
      const lab = await catalog.insertLab({ name: entry.lab.name, slug: entry.lab.slug });
      const source = requireInsertedRow(
        await tx
          .insert(sources)
          .values({
            url: entry.lab.sourceUrl,
            type: "official",
          })
          .returning(),
        "insert source",
      );
      const parsedData = entry.parsedData;
      const observation = requireInsertedRow(
        await tx
          .insert(observations)
          .values({
            sourceId: source.id,
            fetchedAt: SEED_FIRST_SEEN_AT,
            contentHash: sha256(JSON.stringify(parsedData)),
            rawContent: entry.rawContent,
            rawContentHash: sha256(entry.rawContent),
            parsedData,
          })
          .returning(),
        "insert observation",
      );

      for (const modelSpec of entry.models) {
        const model = await catalog.insertModel({
          labId: lab.id,
          name: modelSpec.name,
          slug: modelSpec.slug,
        });
        const offering = await catalog.insertOffering({
          modelId: model.id,
          platform: "official-api",
        });
        const item = requireInsertedRow(
          await tx
            .insert(observationItems)
            .values({
              observationId: observation.id,
              offeringId: offering.id,
              reviewStatus: "confirmed",
              reviewedBy: "seed",
              reviewedAt: SEED_FIRST_SEEN_AT,
              reviewNote: `Hand-checked against ${entry.lab.fixturePath}`,
            })
            .returning(),
          "insert observation item",
        );

        await publishPriceVersion(tx, {
          observationItemId: item.id,
          firstSeenAt: SEED_FIRST_SEEN_AT,
          components: modelSpec.components.map((component) => ({
            dimension: component.dimension,
            unit: "usd_per_1m_tokens",
            amount: component.amount,
          })),
        });

        modelCount += 1;
        offeringCount += 1;
        priceVersionCount += 1;
      }
    }

    await plantSeedPendingExample(tx);

    return {
      labs: plan.length,
      models: modelCount,
      offerings: offeringCount,
      priceVersions: priceVersionCount,
    };
  });
}

/**
 * Add the example flagged snapshot for Claude Mythos 5.1.
 *
 * The amount in that snapshot is not a price. This function does not
 * call publishPriceVersion(). A second call finds the flagged item and
 * inserts nothing. A missing model throws, so this does not invent a lab.
 */
export async function plantSeedPendingExample(
  db: PublishDb,
): Promise<"inserted" | "already-present"> {
  const anthropic = SEED_LABS.find((lab) => lab.slug === "anthropic");
  if (anthropic === undefined) {
    throw new Error("anthropic is missing from the seed list");
  }

  const catalog = createCatalogRepository(db);
  const lab = await catalog.findLabBySlug(anthropic.slug);
  const model =
    lab === null ? null : await catalog.findModelByLabAndSlug(lab.id, PENDING_MODEL_SLUG);
  if (lab === null || model === null) {
    throw new Error(
      `${PENDING_MODEL_SLUG} is not in the database; seed the catalog before the pending example`,
    );
  }

  const offering = await catalog.findOffering(model.id, "official-api", "global");
  if (offering === null) {
    throw new Error(`${PENDING_MODEL_SLUG} has no global offering`);
  }

  const sourceRows = await db
    .select({ id: sources.id })
    .from(sources)
    .where(eq(sources.url, anthropic.sourceUrl))
    .limit(1);
  const source = sourceRows[0];
  if (source === undefined) {
    throw new Error("anthropic official source is missing");
  }

  const flagged = await db
    .select({ id: observationItems.id })
    .from(observationItems)
    .where(
      and(eq(observationItems.offeringId, offering.id), eq(observationItems.reviewStatus, "flagged")),
    )
    .limit(1);
  if (flagged.length > 0) {
    return "already-present";
  }

  const parsedData = {
    example: "pending-review",
    modelSlug: PENDING_MODEL_SLUG,
    dimension: "input",
    usdPer1M: PENDING_AMOUNT,
  };
  const rawContent = `Example pending snapshot for Claude Mythos 5.1. Unverified input amount ${PENDING_AMOUNT}. Not a published price.`;
  const observation = requireInsertedRow(
    await db
      .insert(observations)
      .values({
        sourceId: source.id,
        fetchedAt: PENDING_FETCHED_AT,
        contentHash: sha256(JSON.stringify(parsedData)),
        rawContent,
        rawContentHash: sha256(rawContent),
        parsedData,
      })
      .returning(),
    "insert pending observation",
  );
  requireInsertedRow(
    await db
      .insert(observationItems)
      .values({
        observationId: observation.id,
        offeringId: offering.id,
        reviewStatus: "flagged",
        reviewNote: "Example pending change for the public banner. Not a published price.",
      })
      .returning(),
    "insert pending observation item",
  );

  return "inserted";
}

/** A driver error can include the database URL. The URL contains the password. */
export function redactDatabaseUrl(message: string): string {
  return message.replace(/postgres(?:ql)?:\/\/\S+/gi, "postgresql://[redacted]");
}

function parseFixture(parser: SeedLabSpec["parser"], rawContent: string) {
  if (parser === "anthropic") {
    return parseAnthropicPricing(rawContent);
  }
  return parseOpenAiPricing(rawContent);
}

function modelName(rows: readonly NormalizedPrice[], slug: string): string {
  const name = rows.find((row) => row.modelSlug === slug)?.modelName;
  if (name === undefined) {
    throw new Error(`seed model ${slug} is not in the parser output`);
  }
  return name;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
