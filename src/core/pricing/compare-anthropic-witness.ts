import { Decimal } from "decimal.js";
import type { Condition, NormalizedPrice } from "./shape";

export type WitnessMatch = {
  modelSlug: string;
  dimension: NormalizedPrice["dimension"];
  usdPer1M: string;
  condition?: Condition;
};

export type WitnessMismatch = {
  modelSlug: string;
  dimension: NormalizedPrice["dimension"];
  official: string;
  witness: string;
  condition?: Condition;
};

export type WitnessGap = {
  modelSlug: string;
  dimension: NormalizedPrice["dimension"];
  side: "witness_missing" | "official_missing" | "uncompared";
  condition?: Condition;
};

export type WitnessComparison = {
  matches: WitnessMatch[];
  mismatches: WitnessMismatch[];
  gaps: WitnessGap[];
};

export function compareAnthropicWitness(
  official: NormalizedPrice[],
  witness: NormalizedPrice[],
): WitnessComparison {
  const matches: WitnessMatch[] = [];
  const mismatches: WitnessMismatch[] = [];
  const gaps: WitnessGap[] = [];

  const comparableOfficial = new Map<string, NormalizedPrice>();
  for (const row of official) {
    if (row.condition !== undefined) {
      gaps.push(gapFrom(row, "uncompared"));
      continue;
    }
    comparableOfficial.set(rowKey(row), row);
  }

  const witnessByKey = new Map<string, NormalizedPrice>();
  for (const row of witness) {
    witnessByKey.set(rowKey(row), row);
  }

  for (const [key, officialRow] of comparableOfficial) {
    const witnessRow = witnessByKey.get(key);
    if (!witnessRow) {
      gaps.push(gapFrom(officialRow, "witness_missing"));
      continue;
    }
    if (new Decimal(officialRow.usdPer1M).equals(new Decimal(witnessRow.usdPer1M))) {
      matches.push({
        modelSlug: officialRow.modelSlug,
        dimension: officialRow.dimension,
        usdPer1M: officialRow.usdPer1M,
        ...optionalCondition(officialRow.condition),
      });
      continue;
    }
    mismatches.push({
      modelSlug: officialRow.modelSlug,
      dimension: officialRow.dimension,
      official: officialRow.usdPer1M,
      witness: witnessRow.usdPer1M,
      ...optionalCondition(officialRow.condition),
    });
  }

  for (const [key, witnessRow] of witnessByKey) {
    if (comparableOfficial.has(key)) {
      continue;
    }
    gaps.push(gapFrom(witnessRow, "official_missing"));
  }

  return { matches, mismatches, gaps };
}

function rowKey(row: NormalizedPrice): string {
  return JSON.stringify({
    modelSlug: row.modelSlug,
    dimension: row.dimension,
    condition: row.condition,
  });
}

function gapFrom(row: NormalizedPrice, side: WitnessGap["side"]): WitnessGap {
  return {
    modelSlug: row.modelSlug,
    dimension: row.dimension,
    side,
    ...optionalCondition(row.condition),
  };
}

function optionalCondition(condition: Condition | undefined): { condition?: Condition } {
  return condition === undefined ? {} : { condition };
}
