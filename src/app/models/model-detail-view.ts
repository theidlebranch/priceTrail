import { Decimal } from "decimal.js";
import { changeUnderReview } from "@/app/models/pending-review";
import { toPriceChanges, type PriceChanges, type PriceLastChange } from "@/core/pricing/price-changes";
import {
  isPriceDimension,
  PRICE_DIMENSION_LABELS,
  PRICE_DIMENSIONS,
  toPriceHistories,
  type PriceDimension,
  type PriceHistories,
} from "@/core/pricing/price-history";
import { pricePrecisionLabel } from "@/core/pricing/precision";
import type {
  ModelDetailComponent,
  ModelDetailOffering,
  ModelDetailRead,
} from "@/server/db/repositories/model-detail";

export type { ModelDetailRead } from "@/server/db/repositories/model-detail";

/**
 * Turn one model read into the sentences and the price charts the detail
 * page shows.
 *
 * This file does not open a database. The reader already dropped retracted
 * rows and non-global offerings. Closed rows stay in historyVersions so
 * the chart can draw them. This function still refuses a shape that would
 * hide a problem: two current prices, two official pages, or a tier it
 * cannot name. An empty price is allowed. A missing model is not this
 * function's job. The page answers that with a 404.
 *
 * asOf is the time of this request. The open line ends on that UTC day.
 * This file does not call new Date().
 *
 * Amounts stay the decimal strings from the database. A JavaScript number
 * would turn 0.10 into 0.1. A multiplier and a percent use decimal.js
 * for the same reason. The first version is not a change.
 *
 * changeUnderReview is a yes or no from the official review statuses.
 * It does not carry an unverified amount. The price on the page stays
 * the open version.
 */

// The page renders this list as given. Cache read sits with the leading
// prices, in the same order as the landing receipt. Each cache-write
// tier has its own rank so those rows stay grouped.
const CALENDAR_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const AMOUNT = /^(?:0|[1-9]\d*)(?:\.\d+)?$/;
const HEADLINE_DIMENSIONS = ["input", "output"] as const;

type OpenVersion = ModelDetailOffering["openVersions"][number];

export type ModelDetailLastChange = {
  direction: "down" | "up" | null;
  pctText: string | null;
  dateLine: string;
};

export type ModelDetailPriceRow = {
  dimensionLabel: string;
  amountText: string;
  conditionLabel: string;
  multiplierText: string | null;
  lastChange: ModelDetailLastChange | null;
};

export type ModelDetailHeadline = {
  label: string;
  amountText: string;
  change: {
    direction: "down" | "up";
    pctText: string | null;
    previousAmountText: string;
    previousDateLine: string;
  } | null;
};

export type ModelDetailChangeLine = {
  dimensionLabel: string;
  conditionLabel: string;
  fromAmountText: string | null;
  toAmountText: string | null;
  direction: "down" | "up" | null;
  pctText: string | null;
};

export type ModelDetailChangeEvent = {
  dateLine: string;
  changes: ModelDetailChangeLine[];
};

export type ModelDetailView = {
  labName: string;
  modelName: string;
  retired: boolean;
  versionCount: number;
  sinceDay: string | null;
  headlines: ModelDetailHeadline[];
  price: {
    dateLine: string;
    sourceUrl: string;
    sourceLabel: "Official pricing page";
    components: ModelDetailPriceRow[];
  } | null;
  history: PriceHistories;
  events: ModelDetailChangeEvent[];
  changeUnderReview: boolean;
};

export function toModelDetailView(read: ModelDetailRead, asOf: Date): ModelDetailView {
  if (read.offerings.length > 1) {
    throw new Error("model has more than one global offering");
  }

  const offering = read.offerings[0];
  const open = offering === undefined ? null : openVersion(offering);
  const changes = offering === undefined ? null : toPriceChanges(offering.historyVersions);

  return {
    labName: read.labName,
    modelName: read.modelName,
    retired: read.deprecatedAt !== null,
    versionCount: changes?.versionCount ?? 0,
    sinceDay: changes?.sinceDay ?? null,
    headlines:
      open === null || changes === null ? [] : headlinesFor(open.components, changes.latest),
    price:
      offering === undefined || open === null || changes === null
        ? null
        : currentPrice(offering, open, changes),
    history:
      offering === undefined
        ? { series: [], skipped: [] }
        : toPriceHistories(offering.historyVersions, asOf),
    events: changes === null ? [] : changes.events.map(toEvent),
    changeUnderReview: offering === undefined ? false : changeUnderReview(offering.reviewStatuses),
  };
}

function openVersion(offering: ModelDetailOffering): OpenVersion | null {
  if (offering.openVersions.length === 0) {
    return null;
  }
  if (offering.openVersions.length > 1) {
    throw new Error("offering has more than one open price version");
  }
  return offering.openVersions[0] ?? null;
}

function currentPrice(
  offering: ModelDetailOffering,
  version: OpenVersion,
  changes: PriceChanges,
): NonNullable<ModelDetailView["price"]> {
  const sourceUrl = oneOfficialUrl(offering.officialSourceUrls);
  return {
    dateLine: dateLine(version.firstSeenAt, version.announcedOn),
    sourceUrl,
    sourceLabel: "Official pricing page",
    components: orderedComponents(version.components, changes.lastChanges),
  };
}

/**
 * The same page can be linked from more than one observation item.
 * Those copies are one URL. Two different URLs are not a guess.
 */
function oneOfficialUrl(urls: readonly string[]): string {
  const unique = [...new Set(urls.map((url) => url.trim()).filter((url) => url.length > 0))];
  const url = unique[0];
  if (unique.length !== 1 || url === undefined) {
    throw new Error(`published price has ${unique.length} official source urls`);
  }
  return url;
}

function dateLine(firstSeenAt: Date, announcedOn: string | null): string {
  if (!(firstSeenAt instanceof Date) || Number.isNaN(firstSeenAt.getTime())) {
    throw new Error("firstSeenAt must be a valid date");
  }

  const precision = pricePrecisionLabel({ firstSeenAt, announcedOn });
  if (precision.kind === "observed") {
    return `Changed on or before ${precision.chartStart}.`;
  }

  assertCalendarDate(precision.chartStart);
  const firstSeen = pricePrecisionLabel({ firstSeenAt, announcedOn: null });
  return `Announced for ${precision.chartStart}. First seen ${firstSeen.chartStart}.`;
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

function orderedComponents(
  components: readonly ModelDetailComponent[],
  lastChanges: readonly PriceLastChange[],
): ModelDetailPriceRow[] {
  const baseInput = untieredInputAmount(components);
  return components
    .map((component) => {
      const dimension = asDimension(component.dimension);
      const label = conditionLabel(component.condition);
      return {
        rank: PRICE_DIMENSIONS.indexOf(dimension),
        row: {
          dimensionLabel: PRICE_DIMENSION_LABELS[dimension],
          amountText: amountText(component),
          conditionLabel: label,
          multiplierText: multiplierText(component, baseInput),
          lastChange: lastChangeFor(component, lastChanges),
        },
      };
    })
    .sort((left, right) => {
      if (left.rank !== right.rank) {
        return left.rank - right.rank;
      }
      return left.row.conditionLabel.localeCompare(right.row.conditionLabel);
    })
    .map((entry) => entry.row);
}

function headlinesFor(
  components: readonly ModelDetailComponent[],
  latest: PriceChanges["latest"],
): ModelDetailHeadline[] {
  const headlines: ModelDetailHeadline[] = [];

  for (const dimension of HEADLINE_DIMENSIONS) {
    const rows = components.filter(
      (component) =>
        component.dimension === dimension && conditionKey(component.condition) === emptyConditionKey(),
    );
    const row = rows.length === 1 ? rows[0] : undefined;
    if (row === undefined) {
      continue;
    }

    const change = latest?.changes.find(
      (item) =>
        item.dimension === dimension &&
        conditionKey(item.condition) === emptyConditionKey() &&
        item.fromAmount !== null &&
        item.toAmount !== null &&
        item.direction !== null &&
        sameAmount(item.toAmount, row.amount),
    );

    headlines.push({
      label: PRICE_DIMENSION_LABELS[dimension],
      amountText: amountText(row),
      change:
        change === undefined ||
        latest === null ||
        change.fromAmount === null ||
        change.direction === null
          ? null
          : {
              direction: change.direction,
              pctText: change.pctText,
              previousAmountText: `$${change.fromAmount}`,
              previousDateLine: latest.previousDateLine,
            },
    });
  }

  return headlines;
}

function toEvent(event: NonNullable<PriceChanges["latest"]>): ModelDetailChangeEvent {
  return {
    dateLine: event.dateLine,
    changes: event.changes.map((change) => ({
      dimensionLabel: PRICE_DIMENSION_LABELS[asDimension(change.dimension)],
      conditionLabel: conditionLabel(change.condition),
      fromAmountText: change.fromAmount === null ? null : `$${change.fromAmount}`,
      toAmountText: change.toAmount === null ? null : `$${change.toAmount}`,
      direction: change.direction,
      pctText: change.pctText,
    })),
  };
}

function lastChangeFor(
  component: ModelDetailComponent,
  lastChanges: readonly PriceLastChange[],
): ModelDetailLastChange | null {
  const match = lastChanges.find(
    (change) =>
      change.dimension === component.dimension &&
      conditionKey(change.condition) === conditionKey(component.condition) &&
      change.toAmount !== null &&
      sameAmount(change.toAmount, component.amount),
  );
  if (match === undefined) {
    return null;
  }
  return {
    direction: match.direction,
    pctText: match.pctText,
    dateLine: match.dateLine,
  };
}

function untieredInputAmount(components: readonly ModelDetailComponent[]): string | null {
  const rows = components.filter(
    (component) =>
      component.dimension === "input" && conditionKey(component.condition) === emptyConditionKey(),
  );
  const row = rows.length === 1 ? rows[0] : undefined;
  if (row === undefined || !AMOUNT.test(row.amount)) {
    return null;
  }
  return row.amount;
}

function multiplierText(component: ModelDetailComponent, baseInput: string | null): string | null {
  if (baseInput === null) {
    return null;
  }
  if (
    component.dimension === "input" &&
    conditionKey(component.condition) === emptyConditionKey()
  ) {
    return null;
  }
  if (!AMOUNT.test(component.amount)) {
    throw new Error("amount must be a decimal string");
  }

  const input = new Decimal(baseInput);
  if (input.isZero()) {
    return null;
  }

  const ratio = new Decimal(component.amount).div(input).toDecimalPlaces(6, Decimal.ROUND_HALF_UP);
  return `${ratio.toFixed(6).replace(/\.?0+$/, "")}×`;
}

function sameAmount(left: string, right: string): boolean {
  return new Decimal(left).eq(right);
}

function emptyConditionKey(): string {
  return conditionKey({});
}

function conditionKey(condition: unknown): string {
  if (!isRecord(condition)) {
    throw new Error("condition is not a known tier");
  }
  const keys = Object.keys(condition).sort();
  return JSON.stringify(keys.map((key) => [key, condition[key]]));
}

function amountText(component: ModelDetailComponent): string {
  if (component.unit !== "usd_per_1m_tokens") {
    throw new Error("unit must be usd_per_1m_tokens");
  }
  if (component.amount.length === 0) {
    throw new Error("amount must be a decimal string");
  }
  return `$${component.amount}`;
}

function asDimension(dimension: string): PriceDimension {
  if (!isPriceDimension(dimension)) {
    throw new Error(`dimension ${dimension} is not a known price dimension`);
  }
  return dimension;
}

function conditionLabel(condition: unknown): string {
  if (!isRecord(condition)) {
    throw new Error("condition is not a known tier");
  }

  const keys = Object.keys(condition);
  if (keys.length === 0) {
    return "";
  }
  if (keys.length > 1) {
    throw new Error("condition has more than one tier");
  }

  const key = keys[0];
  if (key === "longContext") {
    if (condition.longContext !== true) {
      throw new Error("condition is not a known tier");
    }
    return "long context, cutoff not stated";
  }
  if (key !== "promptTokensAtMost" && key !== "promptTokensOver") {
    throw new Error("condition is not a known tier");
  }

  const count = condition[key];
  if (typeof count !== "number" || !Number.isInteger(count) || count <= 0) {
    throw new Error("condition is not a known tier");
  }

  const tokens = new Intl.NumberFormat("en-US").format(count);
  if (key === "promptTokensAtMost") {
    return `prompts up to ${tokens} tokens`;
  }
  return `prompts over ${tokens} tokens`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
