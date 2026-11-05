import { Decimal } from "decimal.js";
import {
  isPriceDimension,
  PRICE_DIMENSIONS,
  type PriceHistoryComponent,
  type PriceHistoryPeriod,
} from "@/core/pricing/price-history";
import { pricePrecisionLabel } from "@/core/pricing/precision";

/**
 * Compare published periods and list the prices that actually changed.
 *
 * This file does not open a database and does not call new Date().
 * The first period is the starting price, not a change. Later periods
 * are compared in publication order, which is firstSeenAt. Amounts are
 * decimals, so "0.10" and "0.1" are the same price. A percent is blank
 * when the old amount is missing or zero.
 *
 * Retracted rows never reach this function. The reader drops them first.
 */

export type { PriceHistoryPeriod } from "@/core/pricing/price-history";

export type PriceChangeDirection = "down" | "up";

export type PriceComponentChange = {
  dimension: string;
  condition: unknown;
  fromAmount: string | null;
  toAmount: string | null;
  direction: PriceChangeDirection | null;
  pctText: string | null;
};

export type PriceChangeEvent = {
  dateLine: string;
  previousDateLine: string;
  changes: PriceComponentChange[];
};

export type PriceLastChange = PriceComponentChange & {
  dateLine: string;
};

export type PriceChanges = {
  versionCount: number;
  sinceDay: string | null;
  events: PriceChangeEvent[];
  latest: PriceChangeEvent | null;
  lastChanges: PriceLastChange[];
};

const AMOUNT = /^(?:0|[1-9]\d*)(?:\.\d+)?$/;
const CALENDAR_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

type PreparedPeriod = {
  firstSeenAt: Date;
  chartStart: string;
  dateLine: string;
  components: Map<string, PriceHistoryComponent>;
};

type ActivePrice = {
  amount: string;
  change: PriceLastChange | null;
};

export function toPriceChanges(periods: readonly PriceHistoryPeriod[]): PriceChanges {
  if (periods.length === 0) {
    return { versionCount: 0, sinceDay: null, events: [], latest: null, lastChanges: [] };
  }

  const prepared = periods.map(preparePeriod);
  const chartDays = new Set<string>();
  for (const period of prepared) {
    if (chartDays.has(period.chartStart)) {
      throw new Error("two periods start on the same day");
    }
    chartDays.add(period.chartStart);
  }

  prepared.sort((left, right) => left.firstSeenAt.getTime() - right.firstSeenAt.getTime());

  const events: PriceChangeEvent[] = [];
  for (let index = 1; index < prepared.length; index += 1) {
    const previous = prepared[index - 1];
    const current = prepared[index];
    if (previous === undefined || current === undefined) {
      continue;
    }
    const changes = diffComponents(previous.components, current.components);
    if (changes.length === 0) {
      continue;
    }
    events.push({
      dateLine: current.dateLine,
      previousDateLine: previous.dateLine,
      changes,
    });
  }
  events.reverse();

  const last = prepared[prepared.length - 1];
  const beforeLast = prepared[prepared.length - 2];
  const latestChanges =
    last === undefined || beforeLast === undefined
      ? []
      : diffComponents(beforeLast.components, last.components);

  return {
    versionCount: periods.length,
    sinceDay: prepared[0]?.chartStart ?? null,
    events,
    latest:
      last === undefined || beforeLast === undefined || latestChanges.length === 0
        ? null
        : {
            dateLine: last.dateLine,
            previousDateLine: beforeLast.dateLine,
            changes: latestChanges,
          },
    lastChanges: lastChanges(prepared),
  };
}

function preparePeriod(period: PriceHistoryPeriod): PreparedPeriod {
  if (!isRealDate(period.firstSeenAt)) {
    throw new Error("firstSeenAt must be a valid date");
  }
  if (period.announcedOn != null && period.announcedOn.length > 0) {
    assertCalendarDate(period.announcedOn);
  }

  const precision = pricePrecisionLabel({
    firstSeenAt: period.firstSeenAt,
    announcedOn: period.announcedOn,
  });
  const dateLine =
    precision.kind === "announced"
      ? `Announced for ${precision.chartStart}.`
      : `Changed on or before ${precision.chartStart}.`;

  return {
    firstSeenAt: period.firstSeenAt,
    chartStart: precision.chartStart,
    dateLine,
    components: indexComponents(period.components),
  };
}

function indexComponents(
  components: readonly PriceHistoryComponent[],
): Map<string, PriceHistoryComponent> {
  const indexed = new Map<string, PriceHistoryComponent>();
  for (const component of components) {
    assertComponent(component);
    const key = componentKey(component.dimension, component.condition);
    if (indexed.has(key)) {
      throw new Error("two rows for one price");
    }
    indexed.set(key, component);
  }
  return indexed;
}

function diffComponents(
  previous: Map<string, PriceHistoryComponent>,
  current: Map<string, PriceHistoryComponent>,
): PriceComponentChange[] {
  const keys = new Set([...previous.keys(), ...current.keys()]);
  const changes: PriceComponentChange[] = [];

  for (const key of keys) {
    const before = previous.get(key);
    const after = current.get(key);
    if (
      before !== undefined &&
      after !== undefined &&
      sameAmount(before.amount, after.amount)
    ) {
      continue;
    }

    const from = before === undefined ? null : new Decimal(before.amount);
    const to = after === undefined ? null : new Decimal(after.amount);
    const sample = after ?? before;
    if (sample === undefined) {
      continue;
    }

    let direction: PriceChangeDirection | null = null;
    let pctText: string | null = null;
    if (from !== null && to !== null) {
      if (to.lt(from)) {
        direction = "down";
      } else if (to.gt(from)) {
        direction = "up";
      } else {
        continue;
      }
      pctText = from.isZero() ? null : percentText(from, to);
    }

    changes.push({
      dimension: sample.dimension,
      condition: after?.condition ?? before?.condition,
      fromAmount: before?.amount ?? null,
      toAmount: after?.amount ?? null,
      direction,
      pctText,
    });
  }

  return changes.sort(compareChanges);
}

function lastChanges(periods: readonly PreparedPeriod[]): PriceLastChange[] {
  const active = new Map<string, ActivePrice>();

  for (let index = 0; index < periods.length; index += 1) {
    const period = periods[index];
    if (period === undefined) {
      continue;
    }
    const seen = new Set<string>();

    for (const [key, component] of period.components) {
      seen.add(key);
      const existing = active.get(key);
      if (existing === undefined) {
        active.set(key, {
          amount: component.amount,
          change:
            index === 0
              ? null
              : {
                  dimension: component.dimension,
                  condition: component.condition,
                  fromAmount: null,
                  toAmount: component.amount,
                  direction: null,
                  pctText: null,
                  dateLine: period.dateLine,
                },
        });
        continue;
      }
      if (sameAmount(existing.amount, component.amount)) {
        continue;
      }

      const from = new Decimal(existing.amount);
      const to = new Decimal(component.amount);
      active.set(key, {
        amount: component.amount,
        change: {
          dimension: component.dimension,
          condition: component.condition,
          fromAmount: existing.amount,
          toAmount: component.amount,
          direction: to.lt(from) ? "down" : "up",
          pctText: from.isZero() ? null : percentText(from, to),
          dateLine: period.dateLine,
        },
      });
    }

    for (const key of active.keys()) {
      if (!seen.has(key)) {
        active.delete(key);
      }
    }
  }

  return [...active.values()]
    .flatMap((price) => (price.change === null ? [] : [price.change]))
    .sort(compareChanges);
}

function compareChanges(
  left: { dimension: string; condition: unknown },
  right: { dimension: string; condition: unknown },
): number {
  const leftRank = PRICE_DIMENSIONS.indexOf(
    left.dimension as (typeof PRICE_DIMENSIONS)[number],
  );
  const rightRank = PRICE_DIMENSIONS.indexOf(
    right.dimension as (typeof PRICE_DIMENSIONS)[number],
  );
  if (leftRank !== rightRank) {
    return leftRank - rightRank;
  }
  return conditionKey(left.condition).localeCompare(conditionKey(right.condition));
}

function percentText(from: Decimal, to: Decimal): string {
  const pct = to.minus(from).div(from).abs().times(100);
  return trimDecimal(pct.toDecimalPlaces(2, Decimal.ROUND_HALF_UP));
}

function trimDecimal(value: Decimal): string {
  return value.toFixed(2).replace(/\.?0+$/, "");
}

function sameAmount(left: string, right: string): boolean {
  return new Decimal(left).eq(right);
}

function componentKey(dimension: string, condition: unknown): string {
  return `${dimension}\t${conditionKey(condition)}`;
}

function conditionKey(condition: unknown): string {
  if (!isRecord(condition)) {
    throw new Error("condition is not a known tier");
  }
  const keys = Object.keys(condition).sort();
  return JSON.stringify(keys.map((key) => [key, condition[key]]));
}

function assertComponent(component: PriceHistoryComponent): void {
  if (!isPriceDimension(component.dimension)) {
    throw new Error(`dimension ${component.dimension} is not a known price dimension`);
  }
  if (component.unit !== "usd_per_1m_tokens") {
    throw new Error("unit must be usd_per_1m_tokens");
  }
  if (!AMOUNT.test(component.amount)) {
    throw new Error("amount must be a decimal string");
  }
  const decimal = new Decimal(component.amount);
  if (!decimal.isFinite() || decimal.isNegative()) {
    throw new Error("amount must be a decimal string");
  }
  conditionKey(component.condition);
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
