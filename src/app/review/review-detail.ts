import { formatReviewTimestamp, parseReviewItemId } from "@/app/review/review-list";
import { PRICE_DIMENSION_LABELS } from "@/core/pricing/price-history";
import { normalizedPriceSchema, type Condition, type NormalizedPrice } from "@/core/pricing/shape";

/**
 * Turn one observation item into the sentences the review detail shows.
 *
 * This file does not open a database and does not call new Date().
 * It does not read raw_content. A live check stores parsed_data as
 * rows and warnings. The seeded banner stores a flat example object.
 * That object is not a price list, so no amount is read out of it.
 *
 * A row that fails the price schema, or an amount that is not a plain
 * decimal, throws. A parsed list with no row for this model throws.
 * grounding_result has no shape yet, so any stored value throws instead
 * of being shown as a match. Null means the cell check has not run.
 */

const AMOUNT = /^(?:0|[1-9]\d*)(?:\.\d+)?$/;
const CALENDAR_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

const SOURCE_TYPE_LABELS: Record<string, string> = {
  official: "Official pricing page",
  wayback: "Wayback",
  aggregator: "Aggregator",
  announcement: "Announcement",
  changelog_feed: "Changelog feed",
  platform_api: "Platform API",
};

export type ReviewItemInput = {
  id: number;
  reviewStatus: string;
  labName: string;
  modelName: string;
  modelSlug: string;
  sourceUrl: string;
  sourceType: string;
  fetchedAt: Date;
  reviewNote: string | null;
  reviewedBy: string | null;
  reviewedAt: Date | null;
  groundingResult: unknown;
  parsedData: unknown;
};

export type ReviewDetailPrice = {
  dimensionLabel: string;
  amountText: string;
  conditionText: string | null;
  scheduleText: string | null;
  note: string | null;
  sourceText: string;
};

export type ReviewDetailPrices =
  | {
      kind: "parsed";
      rows: ReviewDetailPrice[];
      warningCount: number;
      warningText: string | null;
    }
  | { kind: "not-a-price-list"; message: "This snapshot is not a parsed price list." };

export type ReviewDetailView = {
  modelName: string;
  labName: string;
  sourceUrl: string;
  sourceTypeLabel: string;
  fetchedAtText: string;
  statusText: string;
  notPublishedText: "This is not a published price.";
  reviewNote: string | null;
  reviewedBy: string | null;
  reviewedAtText: string | null;
  cellCheckText: "No cell check is stored for this item.";
  prices: ReviewDetailPrices;
  actionsText: "Confirm and reject are not on this page yet.";
};

export function toReviewDetailView(item: ReviewItemInput): ReviewDetailView {
  if (item.groundingResult !== null) {
    throw new Error("grounding_result has no reader yet.");
  }
  parseReviewItemId(String(item.id));
  assertText(item.labName, "lab name");
  assertText(item.modelName, "model name");
  assertText(item.modelSlug, "model slug");
  assertText(item.sourceUrl, "source url");
  const sourceTypeLabel = SOURCE_TYPE_LABELS[item.sourceType];
  if (sourceTypeLabel === undefined) {
    throw new Error(`source type ${item.sourceType} is not known`);
  }

  return {
    modelName: item.modelName,
    labName: item.labName,
    sourceUrl: item.sourceUrl,
    sourceTypeLabel,
    fetchedAtText: formatReviewTimestamp(item.fetchedAt, "fetchedAt"),
    statusText: statusText(item.reviewStatus),
    notPublishedText: "This is not a published price.",
    reviewNote: optionalText(item.reviewNote, "review note"),
    reviewedBy: optionalText(item.reviewedBy, "reviewed by"),
    reviewedAtText:
      item.reviewedAt === null ? null : formatReviewTimestamp(item.reviewedAt, "reviewedAt"),
    cellCheckText: "No cell check is stored for this item.",
    prices: readPrices(item.parsedData, item.modelSlug),
    actionsText: "Confirm and reject are not on this page yet.",
  };
}

function statusText(status: string): string {
  if (status === "flagged") {
    return "Waiting for review.";
  }
  if (status === "ok") {
    return "The cell check passed.";
  }
  if (status === "confirmed") {
    return "A reviewer confirmed this item.";
  }
  if (status === "rejected") {
    return "A reviewer rejected this item.";
  }
  throw new Error(`review status ${status} is not known`);
}

function readPrices(parsedData: unknown, modelSlug: string): ReviewDetailPrices {
  if (!isPipelineShape(parsedData)) {
    return {
      kind: "not-a-price-list",
      message: "This snapshot is not a parsed price list.",
    };
  }
  if (!Array.isArray(parsedData.rows) || !Array.isArray(parsedData.warnings)) {
    throw new Error("parsed price list is missing rows or warnings.");
  }
  for (const warning of parsedData.warnings) {
    if (typeof warning !== "string") {
      throw new Error("parsed price warning is not text.");
    }
  }

  const rows = parsedData.rows.map((row) => parsePriceRow(row));
  const mine = rows.filter((row) => row.modelSlug === modelSlug);
  if (mine.length === 0) {
    throw new Error(`parsed price list has no rows for ${modelSlug}`);
  }

  return {
    kind: "parsed",
    warningCount: parsedData.warnings.length,
    warningText: warningText(parsedData.warnings.length),
    rows: mine.map(toPriceView),
  };
}

function parsePriceRow(row: unknown): NormalizedPrice {
  const parsed = normalizedPriceSchema.safeParse(row);
  if (!parsed.success) {
    throw new Error("parsed price row failed the price schema.");
  }
  if (!AMOUNT.test(parsed.data.usdPer1M)) {
    throw new Error("parsed price amount is not a plain decimal.");
  }
  return parsed.data;
}

function warningText(count: number): string | null {
  if (count === 0) {
    return null;
  }
  if (count === 1) {
    return "This snapshot has 1 warning.";
  }
  return `This snapshot has ${count} warnings.`;
}

function toPriceView(row: NormalizedPrice): ReviewDetailPrice {
  return {
    dimensionLabel: PRICE_DIMENSION_LABELS[row.dimension],
    amountText: row.usdPer1M,
    conditionText: conditionText(row.condition),
    scheduleText: scheduleText(row),
    note: row.note ?? null,
    sourceText: row.source,
  };
}

function conditionText(condition: Condition | undefined): string | null {
  if (condition === undefined) {
    return null;
  }
  const parts: string[] = [];
  if (condition.promptTokensAtMost !== undefined) {
    parts.push(`prompts up to ${formatCount(condition.promptTokensAtMost)} tokens`);
  }
  if (condition.promptTokensOver !== undefined) {
    parts.push(`prompts over ${formatCount(condition.promptTokensOver)} tokens`);
  }
  if (condition.promptTokensUnder !== undefined) {
    parts.push(`prompts under ${formatCount(condition.promptTokensUnder)} tokens`);
  }
  if (condition.promptTokensAtLeast !== undefined) {
    parts.push(`prompts at least ${formatCount(condition.promptTokensAtLeast)} tokens`);
  }
  if (parts.length === 0) {
    return null;
  }
  return parts.join("; ");
}

function scheduleText(row: NormalizedPrice): string | null {
  if (row.validFrom !== undefined) {
    assertCalendarDate(row.validFrom);
  }
  if (row.validUntil !== undefined) {
    assertCalendarDate(row.validUntil);
  }
  if (row.validFrom !== undefined && row.validUntil !== undefined) {
    return `${row.validFrom} through ${row.validUntil}`;
  }
  if (row.validFrom !== undefined) {
    return `from ${row.validFrom}`;
  }
  if (row.validUntil !== undefined) {
    return `through ${row.validUntil}`;
  }
  return null;
}

function formatCount(count: number): string {
  return new Intl.NumberFormat("en-US").format(count);
}

function assertCalendarDate(value: string): void {
  const match = CALENDAR_DATE.exec(value);
  if (match === null) {
    throw new Error("schedule date must be a YYYY-MM-DD date");
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const utc = new Date(Date.UTC(year, month - 1, day));
  if (utc.getUTCFullYear() !== year || utc.getUTCMonth() !== month - 1 || utc.getUTCDate() !== day) {
    throw new Error("schedule date must be a YYYY-MM-DD date");
  }
}

function optionalText(value: string | null, label: string): string | null {
  if (value === null) {
    return null;
  }
  if (typeof value !== "string") {
    throw new Error(`${label} is not text`);
  }
  return value;
}

function assertText(value: string, label: string): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} is empty`);
  }
}

function isPipelineShape(value: unknown): value is { rows: unknown; warnings: unknown } {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    "rows" in value &&
    "warnings" in value
  );
}
