import { Decimal } from "decimal.js";
import { normalizedPriceSchema, type Condition, type NormalizedPrice } from "@/core/pricing/shape";

/**
 * Turn one model's parsed rows into the components a confirm can publish.
 *
 * This file does not open a database and does not call new Date().
 * A snapshot that is not `{ rows, warnings }` throws. A schedule date
 * throws, because one price version cannot hold two amounts for the same
 * dimension and tier, and a future segment is not today's price.
 * A witness row throws. Two rows that share a dimension and tier throw.
 * The caller publishes. This function does not.
 */

const AMOUNT = /^(?:0|[1-9]\d*)(?:\.\d+)?$/;

/**
 * A refusal the reviewer can read. A database failure is a different
 * error, so the form can show this sentence and still let a real outage throw.
 */
export class ReviewRefusal extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReviewRefusal";
  }
}

const CONDITION_KEYS = [
  "promptTokensOver",
  "promptTokensAtMost",
  "promptTokensUnder",
  "promptTokensAtLeast",
] as const;

export type ConfirmPriceComponent = {
  dimension: NormalizedPrice["dimension"];
  unit: "usd_per_1m_tokens";
  amount: string;
  condition?: Condition;
};

export function componentsForConfirm(
  parsedData: unknown,
  modelSlug: string,
): ConfirmPriceComponent[] {
  if (modelSlug.trim().length === 0) {
    throw new ReviewRefusal("model slug is empty");
  }
  if (!isPriceList(parsedData)) {
    throw new ReviewRefusal("parsed snapshot is not a parsed price list");
  }
  if (!Array.isArray(parsedData.rows) || !Array.isArray(parsedData.warnings)) {
    throw new ReviewRefusal("parsed price list is missing rows or warnings");
  }
  for (const warning of parsedData.warnings) {
    if (typeof warning !== "string") {
      throw new ReviewRefusal("parsed price warning is not text");
    }
  }

  const mine = parsedData.rows.map(parsePriceRow).filter((row) => row.modelSlug === modelSlug);
  if (mine.length === 0) {
    throw new ReviewRefusal(`parsed price list has no rows for ${modelSlug}`);
  }
  if (mine.some((row) => row.validFrom !== undefined || row.validUntil !== undefined)) {
    throw new ReviewRefusal(`price schedule for ${modelSlug} cannot be confirmed yet`);
  }

  const components = mine.map(toComponent);
  const seen = new Set<string>();
  for (const component of components) {
    const key = componentKey(component.dimension, component.condition ?? {});
    if (seen.has(key)) {
      throw new ReviewRefusal("two rows share the same dimension and tier");
    }
    seen.add(key);
  }
  return components;
}

/**
 * True when the parsed components are the open published price.
 *
 * Amounts are decimals, so "0.10" and "0.1" are the same price. A missing
 * tier and an empty stored condition are the same "no tier" price.
 * A stored condition this file cannot read throws, instead of looking
 * like a price change.
 */
export function sameConfirmPrice(
  next: readonly ConfirmPriceComponent[],
  open: readonly {
    dimension: string;
    unit: string;
    amount: string;
    condition: unknown;
  }[],
): boolean {
  if (next.length !== open.length) {
    return false;
  }
  const openKeys = open.map((component) => storedPriceKey(component));
  const nextKeys = next.map((component) => componentPriceKey(component));
  if (new Set(nextKeys).size !== nextKeys.length) {
    throw new ReviewRefusal("two rows share the same dimension and tier");
  }
  return nextKeys.every((key) => openKeys.includes(key));
}

function parsePriceRow(row: unknown): NormalizedPrice {
  const parsed = normalizedPriceSchema.safeParse(row);
  if (!parsed.success) {
    throw new ReviewRefusal("parsed price row failed the price schema");
  }
  if (!AMOUNT.test(parsed.data.usdPer1M)) {
    throw new ReviewRefusal("parsed price amount is not a plain decimal");
  }
  return parsed.data;
}

function toComponent(row: NormalizedPrice): ConfirmPriceComponent {
  if (row.source !== "official") {
    throw new ReviewRefusal(`parsed price source ${row.source} is not official`);
  }
  const component: ConfirmPriceComponent = {
    dimension: row.dimension,
    unit: "usd_per_1m_tokens",
    amount: row.usdPer1M,
  };
  if (row.condition !== undefined) {
    component.condition = row.condition;
  }
  return component;
}

function componentPriceKey(component: ConfirmPriceComponent): string {
  return JSON.stringify([
    component.dimension,
    component.unit,
    canonicalAmount(component.amount),
    conditionEntries(component.condition ?? {}),
  ]);
}

function storedPriceKey(component: {
  dimension: string;
  unit: string;
  amount: string;
  condition: unknown;
}): string {
  if (!AMOUNT.test(component.amount)) {
    throw new ReviewRefusal("stored price amount is not a plain decimal");
  }
  return JSON.stringify([
    component.dimension,
    component.unit,
    canonicalAmount(component.amount),
    conditionEntries(readCondition(component.condition)),
  ]);
}

function componentKey(dimension: string, condition: Condition): string {
  return JSON.stringify([dimension, conditionEntries(condition)]);
}

function readCondition(value: unknown): Condition {
  if (!isRecord(value)) {
    throw new ReviewRefusal("stored condition is not a known tier");
  }
  const condition: Condition = {};
  for (const [key, entry] of Object.entries(value)) {
    if (key === "longContext") {
      if (entry !== true) {
        throw new ReviewRefusal("stored condition is not a known tier");
      }
      condition.longContext = true;
      continue;
    }
    if (!isConditionKey(key) || !isPositiveInteger(entry)) {
      throw new ReviewRefusal("stored condition is not a known tier");
    }
    condition[key] = entry;
  }
  if (condition.longContext === true && hasTokenBound(condition)) {
    throw new ReviewRefusal("stored condition is not a known tier");
  }
  return condition;
}

function hasTokenBound(condition: Condition): boolean {
  return (
    condition.promptTokensOver !== undefined ||
    condition.promptTokensAtMost !== undefined ||
    condition.promptTokensUnder !== undefined ||
    condition.promptTokensAtLeast !== undefined
  );
}

function conditionEntries(condition: Condition): [string, number | true][] {
  return Object.entries(condition)
    .filter((entry): entry is [string, number | true] => entry[1] !== undefined)
    .sort(([left], [right]) => left.localeCompare(right));
}

/**
 * "1", "1.0", and "1.00" are the same money. Decimal rejects a string
 * that is not a number instead of turning it into NaN quietly.
 */
function canonicalAmount(amount: string): string {
  return new Decimal(amount).toFixed().replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
}

function isConditionKey(value: string): value is (typeof CONDITION_KEYS)[number] {
  return CONDITION_KEYS.some((key) => key === value);
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function isPriceList(value: unknown): value is { rows: unknown; warnings: unknown } {
  return isRecord(value) && "rows" in value && "warnings" in value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
