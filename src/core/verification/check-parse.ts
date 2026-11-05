import { anthropicCacheMultiplierWarnings } from "@/core/pricing/anthropic-cache";
import type { Condition, NormalizedPrice } from "@/core/pricing/shape";

/**
 * Decide whether one successful parse looks broken.
 *
 * This function does not read a database, does not call new Date(), and
 * does not write fetch_log. A broken parse returns status "suspect".
 * The next step is what records that as parser_suspect. An amount that
 * is not a plain decimal throws, because comparing it would be a guess.
 *
 * Anthropic cache rows are compared inside one model, one prompt tier,
 * and one schedule segment. Haiku's "up to 100,000" input is not checked
 * against its "over 100,000" cache price. OpenAI and Google rows are
 * not judged by Anthropic's ratios.
 */

const AMOUNT_PATTERN = /^\d+(\.\d+)?$/;

const CACHE_DIMENSIONS = ["cache_write_5m", "cache_write_1h", "cache_read"] as const;

type ParsedPriceCheck =
  | { status: "ok" }
  | { status: "suspect"; reasons: string[] };

export function checkParsedPrices(input: {
  rows: readonly NormalizedPrice[];
  expectedModelSlugs: readonly string[];
}): ParsedPriceCheck {
  if (input.rows.length === 0) {
    return { status: "suspect", reasons: ["parsed price rows are empty"] };
  }

  for (const row of input.rows) {
    if (!AMOUNT_PATTERN.test(row.usdPer1M)) {
      throw new Error(
        `unreadable price amount for ${row.modelSlug} ${row.dimension}: ${row.usdPer1M}`,
      );
    }
  }

  const reasons: string[] = [];
  const present = new Set(input.rows.map((row) => row.modelSlug));
  for (const slug of input.expectedModelSlugs) {
    if (!present.has(slug)) {
      reasons.push(`missing tracked model: ${slug}`);
    }
  }

  reasons.push(...anthropicRatioReasons(input.rows));

  if (reasons.length === 0) {
    return { status: "ok" };
  }
  return { status: "suspect", reasons };
}

function anthropicRatioReasons(rows: readonly NormalizedPrice[]): string[] {
  const groups = new Map<string, NormalizedPrice[]>();
  for (const row of rows) {
    if (row.provider !== "anthropic") {
      continue;
    }
    const key = groupKey(row);
    const group = groups.get(key);
    if (group) {
      group.push(row);
    } else {
      groups.set(key, [row]);
    }
  }

  const reasons: string[] = [];
  for (const group of groups.values()) {
    reasons.push(...reasonsForGroup(group));
  }
  return reasons;
}

function groupKey(row: NormalizedPrice): string {
  return JSON.stringify({
    modelSlug: row.modelSlug,
    modelName: row.modelName,
    condition: conditionKey(row.condition),
    validFrom: row.validFrom ?? null,
    validUntil: row.validUntil ?? null,
  });
}

function conditionKey(condition: Condition | undefined): Record<string, number | null> {
  return {
    promptTokensOver: condition?.promptTokensOver ?? null,
    promptTokensAtMost: condition?.promptTokensAtMost ?? null,
    promptTokensUnder: condition?.promptTokensUnder ?? null,
    promptTokensAtLeast: condition?.promptTokensAtLeast ?? null,
  };
}

function reasonsForGroup(group: readonly NormalizedPrice[]): string[] {
  const byDimension = new Map<string, NormalizedPrice[]>();
  for (const row of group) {
    const list = byDimension.get(row.dimension);
    if (list) {
      list.push(row);
    } else {
      byDimension.set(row.dimension, [row]);
    }
  }

  const reasons: string[] = [];
  const label = groupLabel(group[0]);
  for (const [dimension, dimensionRows] of byDimension) {
    if (dimensionRows.length > 1) {
      const count = dimensionRows.length === 2 ? "two" : String(dimensionRows.length);
      reasons.push(`${count} ${dimension} rows for ${label}`);
    }
  }

  const inputRows = byDimension.get("input") ?? [];
  const cachePresent = CACHE_DIMENSIONS.some(
    (dimension) => (byDimension.get(dimension) ?? []).length > 0,
  );
  if (cachePresent && inputRows.length === 0) {
    reasons.push(`missing input price for ${label}`);
  }

  // Two inputs means we cannot know which one the cache price belongs to.
  if (inputRows.length !== 1) {
    return reasons;
  }

  const amounts: {
    input: string;
    cache_write_5m?: string;
    cache_write_1h?: string;
    cache_read?: string;
  } = { input: inputRows[0].usdPer1M };

  for (const dimension of CACHE_DIMENSIONS) {
    const dimensionRows = byDimension.get(dimension) ?? [];
    if (dimensionRows.length === 1) {
      amounts[dimension] = dimensionRows[0].usdPer1M;
    }
  }

  reasons.push(...anthropicCacheMultiplierWarnings(group[0].modelName, amounts));
  return reasons;
}

function groupLabel(row: NormalizedPrice): string {
  const parts: string[] = [];
  const condition = row.condition;
  if (condition?.promptTokensAtMost !== undefined) {
    parts.push(`at most ${condition.promptTokensAtMost} prompt tokens`);
  }
  if (condition?.promptTokensOver !== undefined) {
    parts.push(`over ${condition.promptTokensOver} prompt tokens`);
  }
  if (condition?.promptTokensUnder !== undefined) {
    parts.push(`under ${condition.promptTokensUnder} prompt tokens`);
  }
  if (condition?.promptTokensAtLeast !== undefined) {
    parts.push(`at least ${condition.promptTokensAtLeast} prompt tokens`);
  }
  if (row.validFrom) {
    parts.push(`from ${row.validFrom}`);
  }
  if (row.validUntil) {
    parts.push(`until ${row.validUntil}`);
  }
  if (parts.length === 0) {
    return row.modelSlug;
  }
  return `${row.modelSlug} (${parts.join(", ")})`;
}
