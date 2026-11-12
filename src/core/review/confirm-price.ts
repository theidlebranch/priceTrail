import { Decimal } from "decimal.js";
import { normalizedPriceSchema, type Condition, type NormalizedPrice } from "@/core/pricing/shape";

/**
 * A visit writes this when a tracked model's price did not change.
 * It is not a person's account id. Confirm still requires a person
 * when the price did change. Nothing in this file publishes a price.
 */
export const SAME_PRICE_REVIEWER = "system:same-price";
export const SAME_PRICE_NOTE = "Same price as the open version. No new period.";

/**
 * Turn one model's parsed rows into the components a confirm can publish.
 *
 * This file does not open a database and does not call new Date().
 * reviewedAt is the time of the click. The day is that instant in UTC.
 * A snapshot that is not `{ rows, warnings }` throws. A schedule keeps
 * the segment that includes that day. A later segment is dropped. A day
 * that falls in a gap throws. A witness row throws. Two rows that share
 * a dimension and tier throw. The caller publishes. This function does not.
 */

const AMOUNT = /^(?:0|[1-9]\d*)(?:\.\d+)?$/;
const CALENDAR_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

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
  reviewedAt: Date,
): ConfirmPriceComponent[] {
  if (modelSlug.trim().length === 0) {
    throw new ReviewRefusal("model slug is empty");
  }
  const day = utcCalendarDay(reviewedAt);
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

  const components = rowsOnDay(mine, modelSlug, day).map(toComponent);
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

export type OpenPriceComponent = {
  dimension: string;
  unit: string;
  amount: string;
  condition: unknown;
};

/**
 * True when this tracked model should not wait for a person.
 *
 * The prices that would be published on fetchedAt must match the open
 * price. That is every amount that applies on that day: input, output,
 * cache, and a long-context tier in force that day. "10" and "10.0" are
 * the same amount. A later dated price is ignored, and so is another
 * model's row. A missing open price, a difference, or a snapshot this
 * function cannot read returns false, so the item stays flagged.
 * This function does not open a database and does not call new Date().
 */
export function trackedPriceUnchanged(input: {
  nextRows: readonly NormalizedPrice[];
  modelSlug: string;
  fetchedAt: Date;
  open: readonly OpenPriceComponent[] | null;
}): boolean {
  if (input.open === null || input.open.length === 0) {
    return false;
  }
  if (input.modelSlug.trim().length === 0) {
    return false;
  }

  try {
    const components = componentsForConfirm(
      { rows: input.nextRows, warnings: [] },
      input.modelSlug,
      input.fetchedAt,
    );
    return sameConfirmPrice(components, input.open);
  } catch (error) {
    if (error instanceof ReviewRefusal) {
      return false;
    }
    throw error;
  }
}

function utcCalendarDay(value: Date): string {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new ReviewRefusal("reviewedAt must be a valid date");
  }
  const month = String(value.getUTCMonth() + 1).padStart(2, "0");
  const day = String(value.getUTCDate()).padStart(2, "0");
  return `${value.getUTCFullYear()}-${month}-${day}`;
}

/**
 * Keep the rows whose window includes this UTC day.
 *
 * A row with no dates always applies. `validUntil` includes that day.
 * `validFrom` includes that day. A dimension and tier whose every row
 * misses the day has no current price, so confirm stops.
 */
function rowsOnDay(
  rows: readonly NormalizedPrice[],
  modelSlug: string,
  day: string,
): NormalizedPrice[] {
  const currentCount = new Map<string, number>();
  for (const row of rows) {
    assertScheduleDate(row.validFrom);
    assertScheduleDate(row.validUntil);
    const key = componentKey(row.dimension, row.condition ?? {});
    const count = currentCount.get(key) ?? 0;
    currentCount.set(key, count + (appliesOn(row, day) ? 1 : 0));
  }
  for (const count of currentCount.values()) {
    if (count === 0) {
      throw new ReviewRefusal(`no price for ${modelSlug} applies on ${day}`);
    }
  }
  return rows.filter((row) => appliesOn(row, day));
}

function appliesOn(row: NormalizedPrice, day: string): boolean {
  if (row.validFrom !== undefined && day < row.validFrom) {
    return false;
  }
  if (row.validUntil !== undefined && day > row.validUntil) {
    return false;
  }
  return true;
}

function assertScheduleDate(value: string | undefined): void {
  if (value === undefined) {
    return;
  }
  const match = CALENDAR_DATE.exec(value);
  if (match === null) {
    throw new ReviewRefusal("schedule date is not a YYYY-MM-DD date");
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const utc = new Date(Date.UTC(year, month - 1, day));
  if (
    utc.getUTCFullYear() !== year ||
    utc.getUTCMonth() !== month - 1 ||
    utc.getUTCDate() !== day
  ) {
    throw new ReviewRefusal("schedule date is not a YYYY-MM-DD date");
  }
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
