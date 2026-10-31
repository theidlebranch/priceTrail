import { pricePrecisionLabel } from "@/core/pricing/precision";
import type {
  ModelDetailComponent,
  ModelDetailOffering,
  ModelDetailRead,
} from "@/server/db/repositories/model-detail";

export type { ModelDetailRead } from "@/server/db/repositories/model-detail";

/**
 * Turn one model read into the sentences the detail page shows.
 *
 * This file does not open a database. The reader already dropped retracted
 * rows, closed rows, and non-global offerings. This function still refuses
 * a shape that would hide a problem: two current prices, two official
 * pages, or a tier it cannot name. An empty price is allowed. A missing
 * model is not this function's job. The page answers that with a 404.
 *
 * Amounts stay the decimal strings from the database. A JavaScript number
 * would turn 0.10 into 0.1.
 */

const DIMENSION_ORDER = [
  "input",
  "output",
  "cache_read",
  "cache_write",
  "cache_write_5m",
  "cache_write_1h",
] as const;

type Dimension = (typeof DIMENSION_ORDER)[number];

const DIMENSION_LABELS: Record<Dimension, string> = {
  input: "Input",
  output: "Output",
  cache_read: "Cache read",
  cache_write: "Cache write",
  cache_write_5m: "Cache write (5 minutes)",
  cache_write_1h: "Cache write (1 hour)",
};

const CALENDAR_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export type ModelDetailPriceRow = {
  dimensionLabel: string;
  amountText: string;
  conditionLabel: string;
};

export type ModelDetailView = {
  labName: string;
  modelName: string;
  retired: boolean;
  price: {
    dateLine: string;
    sourceUrl: string;
    sourceLabel: "Official pricing page";
    components: ModelDetailPriceRow[];
  } | null;
};

export function toModelDetailView(read: ModelDetailRead): ModelDetailView {
  if (read.offerings.length > 1) {
    throw new Error("model has more than one global offering");
  }

  const offering = read.offerings[0];
  return {
    labName: read.labName,
    modelName: read.modelName,
    retired: read.deprecatedAt !== null,
    price: offering === undefined ? null : currentPrice(offering),
  };
}

function currentPrice(offering: ModelDetailOffering): ModelDetailView["price"] {
  if (offering.openVersions.length === 0) {
    return null;
  }
  if (offering.openVersions.length > 1) {
    throw new Error("offering has more than one open price version");
  }

  const version = offering.openVersions[0];
  if (version === undefined) {
    return null;
  }

  const sourceUrl = oneOfficialUrl(offering.officialSourceUrls);
  return {
    dateLine: dateLine(version.firstSeenAt, version.announcedOn),
    sourceUrl,
    sourceLabel: "Official pricing page",
    components: orderedComponents(version.components),
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

function orderedComponents(components: readonly ModelDetailComponent[]): ModelDetailPriceRow[] {
  return components
    .map((component) => {
      const dimension = asDimension(component.dimension);
      return {
        rank: DIMENSION_ORDER.indexOf(dimension),
        row: {
          dimensionLabel: DIMENSION_LABELS[dimension],
          amountText: amountText(component),
          conditionLabel: conditionLabel(component.condition),
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

function amountText(component: ModelDetailComponent): string {
  if (component.unit !== "usd_per_1m_tokens") {
    throw new Error("unit must be usd_per_1m_tokens");
  }
  if (component.amount.length === 0) {
    throw new Error("amount must be a decimal string");
  }
  return `$${component.amount}`;
}

function asDimension(dimension: string): Dimension {
  if (!isDimension(dimension)) {
    throw new Error(`dimension ${dimension} is not a known price dimension`);
  }
  return dimension;
}

function isDimension(value: string): value is Dimension {
  return (DIMENSION_ORDER as readonly string[]).includes(value);
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
