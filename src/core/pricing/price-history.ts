import { Decimal } from "decimal.js";
import { pricePrecisionLabel } from "@/core/pricing/precision";

/**
 * Turn published periods into one chart line per price we can draw.
 *
 * This file does not open a database and does not call new Date().
 * The page passes asOf, so a test can freeze the day the open line ends.
 *
 * A short price has an empty condition. A long-context price whose cutoff
 * was not stated is its own line. A known token bound stays off the line
 * and is returned so the page can name it. Two short prices, or two
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

    if (boundRows.length > 0) {
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
