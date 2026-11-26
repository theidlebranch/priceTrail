import { contextHeading } from "@/core/pricing/price-history";
import type { Condition, NormalizedPrice } from "@/core/pricing/shape";

/**
 * Decide whether one successful parse looks broken.
 *
 * This function does not read a database, does not call new Date(), and
 * does not write fetch_log. A broken parse returns status "suspect".
 * recordSourceCheck() is what records that as parser_suspect. An amount
 * that is not a plain decimal throws, because comparing it would be a guess.
 *
 * Anthropic rows are grouped by one model, one prompt tier, and one
 * schedule segment. Two amounts for one dimension in that group are
 * suspect. A cache price with no input price in that group is suspect.
 * OpenAI and Google rows are left out of those group checks.
 * A tracked model that is missing from the rows is not suspect. The
 * visit still stores the page. Two good misses become a gone card.
 */

const AMOUNT_PATTERN = /^\d+(\.\d+)?$/;

const CACHE_DIMENSIONS = ["cache_write_5m", "cache_write_1h", "cache_read"] as const;

type ParsedPriceCheck =
  | { status: "ok" }
  | { status: "suspect"; reasons: string[] };

export function checkParsedPrices(input: {
  rows: readonly NormalizedPrice[];
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

  const reasons: string[] = [...anthropicRatioReasons(input.rows)];

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

  return reasons;
}

function groupLabel(row: NormalizedPrice): string {
  const parts: string[] = [];
  const condition = row.condition;
  if (condition?.promptTokensAtMost !== undefined) {
    parts.push(contextHeading("promptTokensAtMost", condition.promptTokensAtMost));
  }
  if (condition?.promptTokensOver !== undefined) {
    parts.push(contextHeading("promptTokensOver", condition.promptTokensOver));
  }
  if (condition?.promptTokensUnder !== undefined) {
    parts.push(contextHeading("promptTokensUnder", condition.promptTokensUnder));
  }
  if (condition?.promptTokensAtLeast !== undefined) {
    parts.push(contextHeading("promptTokensAtLeast", condition.promptTokensAtLeast));
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
