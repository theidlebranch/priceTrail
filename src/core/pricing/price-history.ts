import { Decimal } from "decimal.js";
import { pricePrecisionLabel } from "@/core/pricing/precision";

/**
 * Turn published periods into one chart line per price we can draw.
 *
 * This file does not open a database and does not call new Date().
 * The page passes asOf, so a test can freeze the day the open line ends.
 *
 * A short price has an empty condition. A long-context price whose cutoff
 * was not stated is its own line. A matching pair of token bounds is those
 * two lines as well: the lower bound is the short price, and the upper
 * bound is the long-context price. The number on the pair is the model's
 * own cutoff. A token bound beside a plain price stays off the line and
 * is returned so the page can name it. Two short prices, or two
 * long-context prices, skip that line instead of picking a row. A
 * dimension that has no line left is skipped. The other dimensions
 * still chart. A bad amount, unit, date, or unknown dimension still throws.
 *
 * The solid stretch runs from the chart start through the last day we
 * still saw that price. The dashed gap runs from that day to the next
 * fetch that published the same dimension, even when a source named an
 * earlier start. A period that omits the dimension is not a point. The
 * gap connects the periods that have it. Drawing follows the chart day,
 * and the open-period check follows publication order. changeCount is
 * how many times that amount actually changed. "1.0" and "1" are one
 * price. Retracted rows never reach this function. The reader drops
 * them first.
 */

export const PRICE_DIMENSIONS = [
  "input",
  "cache_read",
  "output",
  "cache_write",
  "cache_write_5m",
  "cache_write_1h",
  "cache_write_30m",
  "cache_write_12h",
] as const;

export type PriceDimension = (typeof PRICE_DIMENSIONS)[number];

export const PRICE_DIMENSION_LABELS: Record<PriceDimension, string> = {
  input: "Input",
  cache_read: "Cache read",
  output: "Output",
  cache_write: "Cache write",
  cache_write_5m: "Cache write (5 minutes)",
  cache_write_1h: "Cache write (1 hour)",
  cache_write_30m: "Cache write (30 minutes)",
  cache_write_12h: "Cache write (12 hours)",
};

export type PriceHistoryComponent = {
  dimension: string;
  unit: string;
  amount: string;
  condition: unknown;
};

export type PriceHistoryPeriod = {
  firstSeenAt: Date;
  announcedOn: string | null;
  lastSeenAt: Date | null;
  components: readonly PriceHistoryComponent[];
};

export type PriceHistorySegment =
  | {
      kind: "known";
      from: string;
      to: string;
      amountText: string;
      amount: number;
      label: string;
    }
  | {
      kind: "gap";
      from: string;
      to: string;
      fromAmountText: string;
      toAmountText: string;
      fromAmount: number;
      toAmount: number;
    };

export type PriceHistorySeries = {
  id: string;
  dimension: PriceDimension;
  label: string;
  note: string | null;
  latestAmountText: string;
  changeCount: number;
  segments: PriceHistorySegment[];
};

export type PriceHistorySkipped = {
  dimension: PriceDimension;
  label: string;
};

export type PriceHistoryBound = {
  dimension: PriceDimension;
  amountText: string;
  condition: Record<string, unknown>;
};

export type PriceHistories = {
  series: PriceHistorySeries[];
  skipped: PriceHistorySkipped[];
  bounds: PriceHistoryBound[];
};

const AMOUNT = /^(?:0|[1-9]\d*)(?:\.\d+)?$/;
const CALENDAR_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

type TimelinePeriod = {
  firstSeenAt: Date;
  lastSeenAt: Date | null;
  chartStart: string;
  label: string;
  components: readonly PriceHistoryComponent[];
};

type PricedPeriod = {
  firstSeenAt: Date;
  lastSeenAt: Date | null;
  chartStart: string;
  label: string;
  amountText: string;
  amount: number;
};

const TOKEN_BOUND_KEYS = [
  "promptTokensOver",
  "promptTokensAtMost",
  "promptTokensUnder",
  "promptTokensAtLeast",
] as const;

/**
 * An older OpenAI row stored "cutoff not stated" instead of a number.
 * The current page states 272,000. Reading the flag as that number lets
 * the old row and the new row sit on the same line. A row that already
 * names its own cutoff, such as 200,000, is left alone.
 */
const UNSTATED_LONG_CONTEXT_TOKENS = 272_000;

const LOWER_KEYS = ["promptTokensAtMost", "promptTokensUnder"] as const;
const UPPER_KEYS = ["promptTokensOver", "promptTokensAtLeast"] as const;

export type ContextBoundKey = (typeof LOWER_KEYS)[number] | (typeof UPPER_KEYS)[number];

export type ContextBound = {
  tokens: number;
  lower: (typeof LOWER_KEYS)[number];
  upper: (typeof UPPER_KEYS)[number];
};

type RowKind = "short" | "longContext" | "bound";

type ReadRow = {
  amountText: string;
  amount: number;
  kind: RowKind;
  condition: Record<string, unknown>;
};

type ChartableSeries = {
  blocked: boolean;
  priced: PricedPeriod[];
};

export function isPriceDimension(value: string): value is PriceDimension {
  return (PRICE_DIMENSIONS as readonly string[]).includes(value);
}

export function toPriceHistories(
  periods: readonly PriceHistoryPeriod[],
  asOf: Date,
): PriceHistories {
  if (!isRealDate(asOf)) {
    throw new Error("asOf must be a valid date");
  }
  if (periods.length === 0) {
    return { series: [], skipped: [], bounds: [] };
  }

  const asOfDay = utcDay(asOf);
  const prepared = periods.map((period) => prepareTimeline(period));
  const byChart = [...prepared].sort((left, right) =>
    left.chartStart.localeCompare(right.chartStart),
  );
  const byPublication = [...prepared].sort(
    (left, right) => left.firstSeenAt.getTime() - right.firstSeenAt.getTime(),
  );

  for (const period of byChart) {
    for (const component of period.components) {
      if (!isPriceDimension(component.dimension)) {
        throw new Error(`dimension ${component.dimension} is not a known price dimension`);
      }
      readRow(component);
    }
  }

  assertChartDays(byChart, asOfDay);
  assertPublicationOrder(byPublication);

  const series: PriceHistorySeries[] = [];
  const skipped: PriceHistorySkipped[] = [];
  const bounds: PriceHistoryBound[] = [];

  for (const dimension of PRICE_DIMENSIONS) {
    const classified = classifyDimension(dimension, byChart);
    if (classified === null) {
      continue;
    }

    const charted = [
      classified.short.blocked
        ? null
        : toSeries(dimension, dimension, classified.short.priced, asOfDay),
      classified.longContext.blocked
        ? null
        : toSeries(
            `${dimension}:longContext`,
            dimension,
            classified.longContext.priced,
            asOfDay,
          ),
    ].filter((item): item is PriceHistorySeries => item !== null);

    if (charted.length === 0) {
      skipped.push({ dimension, label: PRICE_DIMENSION_LABELS[dimension] });
      continue;
    }
    series.push(...charted);
    bounds.push(...classified.bounds);
  }

  return { series, skipped, bounds };
}

function prepareTimeline(period: PriceHistoryPeriod): TimelinePeriod {
  if (!isRealDate(period.firstSeenAt)) {
    throw new Error("firstSeenAt must be a valid date");
  }
  if (period.lastSeenAt !== null && !isRealDate(period.lastSeenAt)) {
    throw new Error("lastSeenAt must be a valid date");
  }
  if (period.announcedOn != null && period.announcedOn.length > 0) {
    assertCalendarDate(period.announcedOn);
  }

  const precision = pricePrecisionLabel({
    firstSeenAt: period.firstSeenAt,
    announcedOn: period.announcedOn,
  });
  const label =
    precision.kind === "announced"
      ? `Announced for ${precision.chartStart}.`
      : `Changed on or before ${precision.chartStart}.`;

  return {
    firstSeenAt: period.firstSeenAt,
    lastSeenAt: period.lastSeenAt,
    chartStart: precision.chartStart,
    label,
    components: period.components,
  };
}

function assertChartDays(periods: readonly TimelinePeriod[], asOfDay: string): void {
  for (const period of periods) {
    if (asOfDay < period.chartStart) {
      throw new Error("asOf is before the chart start");
    }
    const end = period.lastSeenAt === null ? asOfDay : utcDay(period.lastSeenAt);
    if (end < period.chartStart) {
      throw new Error("last seen is before the chart start");
    }
  }

  for (let index = 1; index < periods.length; index += 1) {
    const previous = periods[index - 1];
    const current = periods[index];
    if (previous === undefined || current === undefined) {
      continue;
    }
    if (previous.chartStart === current.chartStart) {
      throw new Error("two periods start on the same day");
    }
  }
}

function assertPublicationOrder(periods: readonly TimelinePeriod[]): void {
  for (let index = 1; index < periods.length; index += 1) {
    const previous = periods[index - 1];
    const current = periods[index];
    if (previous === undefined || current === undefined) {
      continue;
    }
    if (previous.lastSeenAt === null) {
      throw new Error("an earlier period is still open");
    }
    const gapFrom = utcDay(previous.lastSeenAt);
    const gapTo = utcDay(current.firstSeenAt);
    if (gapTo < gapFrom) {
      throw new Error("next first seen is before the previous last seen");
    }
  }
}

function toSeries(
  id: string,
  dimension: PriceDimension,
  priced: readonly PricedPeriod[],
  asOfDay: string,
): PriceHistorySeries | null {
  const latest = priced[priced.length - 1];
  if (latest === undefined) {
    return null;
  }
  return {
    id,
    dimension,
    label: PRICE_DIMENSION_LABELS[dimension],
    note: null,
    latestAmountText: latest.amountText,
    changeCount: countAmountChanges(priced),
    segments: segmentsFor(priced, asOfDay),
  };
}

function classifyDimension(
  dimension: PriceDimension,
  periods: readonly TimelinePeriod[],
): {
  short: ChartableSeries;
  longContext: ChartableSeries;
  bounds: PriceHistoryBound[];
} | null {
  let sawRow = false;
  const short: ChartableSeries = { blocked: false, priced: [] };
  const longContext: ChartableSeries = { blocked: false, priced: [] };
  let bounds: PriceHistoryBound[] = [];

  for (const period of periods) {
    const rows = period.components.filter((component) => component.dimension === dimension);
    if (rows.length === 0) {
      continue;
    }
    sawRow = true;
    const read = rows.map((row) => readRow(row));
    const shorts = read.filter((row) => row.kind === "short");
    const longs = read.filter((row) => row.kind === "longContext");
    const boundRows = read.filter((row) => row.kind === "bound");

    if (shorts.length > 1) {
      short.blocked = true;
    } else if (shorts.length === 1) {
      const price = shorts[0];
      if (price !== undefined) {
        short.priced.push(pricedPeriod(period, price));
      }
    }

    if (longs.length > 1) {
      longContext.blocked = true;
    } else if (longs.length === 1) {
      const price = longs[0];
      if (price !== undefined) {
        longContext.priced.push(pricedPeriod(period, price));
      }
    }

    const pair = shorts.length === 0 && longs.length === 0 ? findPair(boundRows) : null;
    if (pair !== null) {
      short.priced.push(pricedPeriod(period, pair.lower));
      longContext.priced.push(pricedPeriod(period, pair.upper));
      bounds = [];
    } else {
      bounds = boundRows.map((row) => ({
        dimension,
        amountText: row.amountText,
        condition: row.condition,
      }));
    }
  }

  if (!sawRow) {
    return null;
  }
  return { short, longContext, bounds };
}

function pricedPeriod(period: TimelinePeriod, price: ReadRow): PricedPeriod {
  return {
    firstSeenAt: period.firstSeenAt,
    lastSeenAt: period.lastSeenAt,
    chartStart: period.chartStart,
    label: period.label,
    amountText: price.amountText,
    amount: price.amount,
  };
}

function countAmountChanges(periods: readonly PricedPeriod[]): number {
  let count = 0;
  for (let index = 1; index < periods.length; index += 1) {
    const previous = periods[index - 1];
    const current = periods[index];
    if (previous === undefined || current === undefined) {
      continue;
    }
    if (!new Decimal(previous.amountText).eq(current.amountText)) {
      count += 1;
    }
  }
  return count;
}

function segmentsFor(periods: readonly PricedPeriod[], asOfDay: string): PriceHistorySegment[] {
  const segments: PriceHistorySegment[] = [];

  for (let index = 0; index < periods.length; index += 1) {
    const current = periods[index];
    if (current === undefined) {
      continue;
    }
    const next = periods[index + 1];
    const end = current.lastSeenAt === null ? asOfDay : utcDay(current.lastSeenAt);

    segments.push({
      kind: "known",
      from: current.chartStart,
      to: end,
      amountText: current.amountText,
      amount: current.amount,
      label: current.label,
    });

    if (next === undefined || current.lastSeenAt === null) {
      continue;
    }

    const gapFrom = utcDay(current.lastSeenAt);
    const gapTo = utcDay(next.firstSeenAt);
    if (gapTo < gapFrom) {
      throw new Error("next first seen is before the previous last seen");
    }
    if (gapTo === gapFrom) {
      continue;
    }

    segments.push({
      kind: "gap",
      from: gapFrom,
      to: gapTo,
      fromAmountText: current.amountText,
      toAmountText: next.amountText,
      fromAmount: current.amount,
      toAmount: next.amount,
    });
  }

  return segments;
}

function readRow(row: PriceHistoryComponent): ReadRow {
  if (!isRecord(row.condition)) {
    throw new Error("condition is not a known tier");
  }
  if (row.unit !== "usd_per_1m_tokens") {
    throw new Error("unit must be usd_per_1m_tokens");
  }
  if (!AMOUNT.test(row.amount)) {
    throw new Error("amount must be a decimal string");
  }

  const decimal = new Decimal(row.amount);
  if (!decimal.isFinite() || decimal.isNegative()) {
    throw new Error("amount must be a decimal string");
  }

  return {
    amountText: row.amount,
    amount: decimal.toNumber(),
    kind: conditionKind(row.condition),
    condition: row.condition,
  };
}

function conditionKind(condition: Record<string, unknown>): RowKind {
  const keys = Object.keys(condition);
  if (keys.length === 0) {
    return "short";
  }
  if (keys.length !== 1) {
    throw new Error("condition is not a known tier");
  }
  const key = keys[0];
  if (key === "longContext") {
    if (condition.longContext !== true) {
      throw new Error("condition is not a known tier");
    }
    return "longContext";
  }
  if (!isTokenBoundKey(key) || !isPositiveInteger(condition[key])) {
    throw new Error("condition is not a known tier");
  }
  return "bound";
}

function isTokenBoundKey(value: string | undefined): value is (typeof TOKEN_BOUND_KEYS)[number] {
  return TOKEN_BOUND_KEYS.some((key) => key === value);
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function utcDay(value: Date): string {
  return pricePrecisionLabel({ firstSeenAt: value, announcedOn: null }).chartStart;
}

function assertCalendarDate(value: string): void {
  const match = CALENDAR_DATE.exec(value);
  if (match === null) {
    throw new Error("announcedOn must be a YYYY-MM-DD date");
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
    throw new Error("announcedOn must be a YYYY-MM-DD date");
  }
}

function isRealDate(value: Date): boolean {
  return value instanceof Date && !Number.isNaN(value.getTime());
}

function findPair(rows: readonly ReadRow[]): { lower: ReadRow; upper: ReadRow } | null {
  if (rows.length !== 2) {
    return null;
  }
  const [first, second] = rows;
  if (first === undefined || second === undefined) {
    return null;
  }
  const left = boundRole(first.condition);
  const right = boundRole(second.condition);
  if (left === null || right === null || left.tokens !== right.tokens) {
    return null;
  }
  if (left.side === "lower" && right.side === "upper" && keysMatch(left.key, right.key)) {
    return { lower: first, upper: second };
  }
  if (right.side === "lower" && left.side === "upper" && keysMatch(right.key, left.key)) {
    return { lower: second, upper: first };
  }
  return null;
}

type BoundRole = {
  side: "lower" | "upper";
  key: ContextBoundKey;
  tokens: number;
};

function boundRole(condition: Record<string, unknown>): BoundRole | null {
  const role = conditionRole(condition);
  if (role === "plain" || role === "unstated") {
    return null;
  }
  return role;
}

type ConditionRole = "plain" | "unstated" | BoundRole;

function conditionRole(condition: unknown): ConditionRole {
  if (!isRecord(condition)) {
    throw new Error("condition is not a known tier");
  }
  const keys = Object.keys(condition);
  if (keys.length === 0) {
    return "plain";
  }
  if (keys.length !== 1) {
    throw new Error("condition is not a known tier");
  }
  const key = keys[0];
  if (key === "longContext") {
    if (condition.longContext !== true) {
      throw new Error("condition is not a known tier");
    }
    return "unstated";
  }
  if (!isContextBoundKey(key) || !isPositiveInteger(condition[key])) {
    throw new Error("condition is not a known tier");
  }
  const side = isLowerKey(key) ? "lower" : "upper";
  return { side, key, tokens: condition[key] };
}

function keysMatch(lower: ContextBoundKey, upper: ContextBoundKey): boolean {
  return (
    (lower === "promptTokensAtMost" && upper === "promptTokensOver") ||
    (lower === "promptTokensUnder" && upper === "promptTokensAtLeast")
  );
}

function isLowerKey(value: ContextBoundKey): value is (typeof LOWER_KEYS)[number] {
  return LOWER_KEYS.some((key) => key === value);
}

function isContextBoundKey(value: string | undefined): value is ContextBoundKey {
  return isTokenBoundKey(value);
}

/**
 * The two rows of one dimension, when they are one short price and one
 * long price at the same cutoff. A plain price plus one extra bound is
 * not a pair. A plain price next to an unstated long-context flag is
 * read as 272,000 so it matches a later row that stored the number.
 */
export function matchingContext(rows: readonly { condition: unknown }[]): ContextBound | null {
  if (rows.length !== 2) {
    return null;
  }
  const roles = rows.map((row) => conditionRole(row.condition));
  const [left, right] = roles;
  if (left === undefined || right === undefined) {
    return null;
  }
  const numeric = numericPair(left, right);
  if (numeric !== null) {
    return numeric;
  }
  const plainFirst = left === "plain" && right === "unstated";
  const plainSecond = right === "plain" && left === "unstated";
  if (!plainFirst && !plainSecond) {
    return null;
  }
  return {
    tokens: UNSTATED_LONG_CONTEXT_TOKENS,
    lower: "promptTokensAtMost",
    upper: "promptTokensOver",
  };
}

function numericPair(left: ConditionRole, right: ConditionRole): ContextBound | null {
  if (left === "plain" || left === "unstated" || right === "plain" || right === "unstated") {
    return null;
  }
  if (left.tokens !== right.tokens) {
    return null;
  }
  if (left.side === "lower" && right.side === "upper") {
    return boundFrom(left, right);
  }
  if (right.side === "lower" && left.side === "upper") {
    return boundFrom(right, left);
  }
  return null;
}

function boundFrom(lower: BoundRole, upper: BoundRole): ContextBound | null {
  if (lower.tokens !== upper.tokens) {
    return null;
  }
  if (lower.key === "promptTokensAtMost" && upper.key === "promptTokensOver") {
    return { tokens: lower.tokens, lower: lower.key, upper: upper.key };
  }
  if (lower.key === "promptTokensUnder" && upper.key === "promptTokensAtLeast") {
    return { tokens: lower.tokens, lower: lower.key, upper: upper.key };
  }
  return null;
}

/**
 * Replace an unstated long-context flag, and the plain price beside it,
 * with the 272,000 bounds. Other rows are copied through unchanged.
 * This does not write a price. It only gives the chart and the change
 * log one key for the old row and the new row.
 */
export function rewriteUnstatedLongContext<T extends { dimension: string; condition: unknown }>(
  components: readonly T[],
): T[] {
  const indexes = new Map<string, number[]>();
  components.forEach((component, index) => {
    const list = indexes.get(component.dimension) ?? [];
    list.push(index);
    indexes.set(component.dimension, list);
  });

  const replacements = new Map<number, ContextBoundKey>();
  for (const group of indexes.values()) {
    if (group.length !== 2) {
      continue;
    }
    const first = group[0];
    const second = group[1];
    if (first === undefined || second === undefined) {
      continue;
    }
    const left = conditionRole(components[first]?.condition);
    const right = conditionRole(components[second]?.condition);
    const plainIndex = left === "plain" ? first : right === "plain" ? second : -1;
    const unstatedIndex = left === "unstated" ? first : right === "unstated" ? second : -1;
    if (plainIndex < 0 || unstatedIndex < 0) {
      continue;
    }
    replacements.set(plainIndex, "promptTokensAtMost");
    replacements.set(unstatedIndex, "promptTokensOver");
  }

  return components.map((component, index) => {
    const key = replacements.get(index);
    if (key === undefined) {
      return component;
    }
    return { ...component, condition: { [key]: UNSTATED_LONG_CONTEXT_TOKENS } };
  });
}

export function contextHeading(key: ContextBoundKey, tokens: number): string {
  const count = formatTokens(tokens);
  if (key === "promptTokensAtMost") {
    return `Up to ${count} tokens`;
  }
  if (key === "promptTokensUnder") {
    return `Under ${count} tokens`;
  }
  if (key === "promptTokensOver") {
    return `Over ${count} tokens`;
  }
  return `At least ${count} tokens`;
}

export function shortConditionLabel(condition: unknown): string {
  const role = conditionRole(condition);
  if (role === "plain") {
    return "";
  }
  if (role === "unstated") {
    return "long context";
  }
  const mark =
    role.key === "promptTokensAtMost"
      ? "≤"
      : role.key === "promptTokensUnder"
        ? "<"
        : role.key === "promptTokensOver"
          ? ">"
          : "≥";
  return `${mark}${compactTokens(role.tokens)}`;
}

function formatTokens(tokens: number): string {
  return new Intl.NumberFormat("en-US").format(tokens);
}

function compactTokens(tokens: number): string {
  if (tokens >= 1000 && tokens % 1000 === 0) {
    return `${tokens / 1000}K`;
  }
  return formatTokens(tokens);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
