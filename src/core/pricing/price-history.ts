import { Decimal } from "decimal.js";
import { pricePrecisionLabel } from "@/core/pricing/precision";

/**
 * Turn published periods into one chart per untiered price.
 *
 * This file does not open a database and does not call new Date().
 * The page passes asOf, so a test can freeze the day the open line ends.
 *
 * Each dimension is its own series, in the same order as the price card.
 * A dimension with no rows is left out. A tier, or two rows on one period,
 * is skipped instead of picking a row. The other dimensions still chart.
 * A bad amount, unit, date, or unknown dimension still throws.
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
] as const;

export type PriceDimension = (typeof PRICE_DIMENSIONS)[number];

export const PRICE_DIMENSION_LABELS: Record<PriceDimension, string> = {
  input: "Input",
  cache_read: "Cache read",
  output: "Output",
  cache_write: "Cache write",
  cache_write_5m: "Cache write (5 minutes)",
  cache_write_1h: "Cache write (1 hour)",
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
  dimension: PriceDimension;
  label: string;
  latestAmountText: string;
  changeCount: number;
  segments: PriceHistorySegment[];
};

export type PriceHistorySkipped = {
  dimension: PriceDimension;
  label: string;
};

export type PriceHistories = {
  series: PriceHistorySeries[];
  skipped: PriceHistorySkipped[];
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

type ReadRow = {
  amountText: string;
  amount: number;
  tiered: boolean;
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
    return { series: [], skipped: [] };
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

  for (const dimension of PRICE_DIMENSIONS) {
    const classified = classifyDimension(dimension, byChart);
    if (classified === null) {
      continue;
    }
    if (classified.blocked) {
      skipped.push({ dimension, label: PRICE_DIMENSION_LABELS[dimension] });
      continue;
    }

    const latest = classified.priced[classified.priced.length - 1];
    if (latest === undefined) {
      continue;
    }
    series.push({
      dimension,
      label: PRICE_DIMENSION_LABELS[dimension],
      latestAmountText: latest.amountText,
      changeCount: countAmountChanges(classified.priced),
      segments: segmentsFor(classified.priced, asOfDay),
    });
  }

  return { series, skipped };
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

function classifyDimension(
  dimension: PriceDimension,
  periods: readonly TimelinePeriod[],
): { blocked: boolean; priced: PricedPeriod[] } | null {
  let sawRow = false;
  let blocked = false;
  const priced: PricedPeriod[] = [];

  for (const period of periods) {
    const rows = period.components.filter((component) => component.dimension === dimension);
    if (rows.length === 0) {
      continue;
    }
    sawRow = true;
    const read = rows.map((row) => readRow(row));
    if (rows.length > 1 || read.some((row) => row.tiered)) {
      blocked = true;
      continue;
    }
    const price = read[0];
    if (price === undefined) {
      continue;
    }
    priced.push({
      firstSeenAt: period.firstSeenAt,
      lastSeenAt: period.lastSeenAt,
      chartStart: period.chartStart,
      label: period.label,
      amountText: price.amountText,
      amount: price.amount,
    });
  }

  if (!sawRow) {
    return null;
  }
  return { blocked, priced };
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
    tiered: Object.keys(row.condition).length > 0,
  };
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
