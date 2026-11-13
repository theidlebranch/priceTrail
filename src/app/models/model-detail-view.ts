import { Decimal } from "decimal.js";
import { changeUnderReview } from "@/app/models/pending-review";
import { toPriceChanges, type PriceChanges, type PriceLastChange } from "@/core/pricing/price-changes";
import {
  contextHeading,
  isPriceDimension,
  matchingContext,
  PRICE_DIMENSION_LABELS,
  PRICE_DIMENSIONS,
  rewriteUnstatedLongContext,
  shortConditionLabel,
  toPriceHistories,
  type ContextBoundKey,
  type PriceDimension,
  type PriceHistories,
  type PriceHistorySeries,
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

export type ModelDetailPriceGroup = {
  heading: string | null;
  rows: ModelDetailPriceRow[];
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

/**
 * One context price the page can show on its own.
 *
 * label is null when the model has a single price. The page then draws
 * no tier tabs. A short and a long price each get the stored cutoff,
 * such as "Up to 272,000 tokens".
 */
export type ModelDetailTier = {
  label: string | null;
  headlines: ModelDetailHeadline[];
  rows: ModelDetailPriceRow[];
  series: PriceHistorySeries[];
};

export type ModelDetailChangeLine = {
  dimensionLabel: string;
  conditionLabel: string;
  fromAmountText: string | null;
  toAmountText: string | null;
  direction: "down" | "up" | null;
  pctText: string | null;
};

export type ModelDetailProof =
  | { kind: "link"; url: string; text: "Archived snapshot" }
  | { kind: "missing"; text: "No archived snapshot." };

export type ModelDetailChangeEvent = {
  dateLine: string;
  changes: ModelDetailChangeLine[];
  proof: ModelDetailProof;
};

export type ModelDetailStartingPrice = {
  dateLine: string;
  proof: ModelDetailProof;
};

type ModelDetailHistory = PriceHistories & {
  notes: string[];
};

export type ModelDetailView = {
  labName: string;
  modelName: string;
  retired: boolean;
  versionCount: number;
  sinceDay: string | null;
  headlines: ModelDetailHeadline[];
  tiers: ModelDetailTier[];
  price: {
    dateLine: string;
    sourceUrl: string;
    sourceLabel: "Official pricing page";
    proof: ModelDetailProof;
    components: ModelDetailPriceRow[];
    groups?: ModelDetailPriceGroup[];
  } | null;
  history: ModelDetailHistory;
  events: ModelDetailChangeEvent[];
  startingPrice: ModelDetailStartingPrice | null;
  changeUnderReview: boolean;
};

export function toModelDetailView(read: ModelDetailRead, asOf: Date): ModelDetailView {
  if (read.offerings.length > 1) {
    throw new Error("model has more than one global offering");
  }

  const offering = read.offerings[0];
  const open = offering === undefined ? null : openVersion(offering);
  const proofs = offering === undefined ? null : proofByDateLine(offering.historyVersions);
  const changes = offering === undefined ? null : toPriceChanges(offering.historyVersions);
  const shown = open === null ? null : rewriteUnstatedLongContext(open.components);
  const history =
    offering === undefined
      ? { series: [], skipped: [], bounds: [], notes: [] }
      : presentHistory(toPriceHistories(offering.historyVersions, asOf), shown !== null && cutoffStated(shown));
  const layout = shown === null || changes === null ? null : layoutPrices(shown, changes.lastChanges);

  return {
    labName: read.labName,
    modelName: read.modelName,
    retired: read.deprecatedAt !== null,
    versionCount: changes?.versionCount ?? 0,
    sinceDay: changes?.sinceDay ?? null,
    headlines: shown === null || changes === null ? [] : headlinesFor(shown, changes.latest),
    tiers: toTiers(shown, changes, history, layout),
    price:
      offering === undefined || open === null || layout === null
        ? null
        : currentPrice(offering, open, layout),
    history,
    events:
      changes === null || proofs === null
        ? []
        : changes.events.map((event) => ({
            ...toEvent(event),
            proof: proofForLine(proofs, event.dateLine),
          })),
    startingPrice:
      changes === null || proofs === null || offering === undefined || changes.events.length === 0
        ? null
        : startingPrice(offering.historyVersions, proofs),
    changeUnderReview: offering === undefined ? false : changeUnderReview(offering.reviewStatuses),
  };
}

function presentHistory(history: PriceHistories, stated: boolean): ModelDetailHistory {
  return {
    series: history.series.map((item) =>
      item.id.endsWith(":longContext")
        ? {
            ...item,
            label: `${PRICE_DIMENSION_LABELS[item.dimension]}, long context`,
            note: stated ? null : "Cutoff not stated.",
          }
        : item,
    ),
    skipped: history.skipped,
    bounds: history.bounds,
    notes: history.bounds.map(
      (bound) =>
        `${PRICE_DIMENSION_LABELS[bound.dimension]} also has a price for ${conditionLabel(bound.condition)}, $${bound.amountText}. It is not on this chart.`,
    ),
  };
}

function cutoffStated(components: readonly ModelDetailComponent[]): boolean {
  for (const dimension of new Set(components.map((component) => component.dimension))) {
    if (matchingContext(components.filter((component) => component.dimension === dimension)) !== null) {
      return true;
    }
  }
  return false;
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
  layout: LaidOutPrices,
): NonNullable<ModelDetailView["price"]> {
  return {
    dateLine: dateLine(version.firstSeenAt, version.announcedOn),
    sourceUrl: oneOfficialUrl(offering.officialSourceUrls),
    sourceLabel: "Official pricing page",
    proof: snapshotProof(version.archiveUrl, version.archiveStatus),
    components: layout.components,
    groups: layout.groups,
  };
}

/**
 * The opening snapshot is a Wayback permalink, or a sentence when that
 * snapshot was never archived. A filled URL that is not that permalink
 * is a broken row, so the page refuses it instead of linking somewhere else.
 */
function snapshotProof(
  archiveUrl: string | null,
  archiveStatus: ModelDetailOffering["openVersions"][number]["archiveStatus"],
): ModelDetailProof {
  if (
    archiveUrl === null &&
    (archiveStatus === null || archiveStatus === "pending" || archiveStatus === "failed")
  ) {
    return { kind: "missing", text: "No archived snapshot." };
  }

  const permalink =
    archiveStatus === "archived" && archiveUrl !== null ? waybackPermalink(archiveUrl) : null;
  if (permalink !== null) {
    return { kind: "link", url: permalink, text: "Archived snapshot" };
  }

  throw new Error("published price has an archive row that is not a Wayback permalink");
}

function waybackPermalink(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed === "") {
    return null;
  }
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.hostname !== "web.archive.org") {
    return null;
  }
  if (!/^\/web\/([^/]+)\/(.+)$/.test(url.pathname)) {
    return null;
  }
  return trimmed;
}

function proofByDateLine(
  versions: readonly ModelDetailOffering["historyVersions"][number][],
): Map<string, ModelDetailProof> {
  const proofs = new Map<string, ModelDetailProof>();
  for (const version of versions) {
    const line = dateLine(version.firstSeenAt, version.announcedOn);
    if (proofs.has(line)) {
      throw new Error("two periods start on the same day");
    }
    proofs.set(line, snapshotProof(version.archiveUrl, version.archiveStatus));
  }
  return proofs;
}

function proofForLine(proofs: ReadonlyMap<string, ModelDetailProof>, dateLineText: string): ModelDetailProof {
  const proof = proofs.get(dateLineText);
  if (proof === undefined) {
    throw new Error(`no snapshot for ${dateLineText}`);
  }
  return proof;
}

function startingPrice(
  versions: readonly ModelDetailOffering["historyVersions"][number][],
  proofs: ReadonlyMap<string, ModelDetailProof>,
): ModelDetailStartingPrice {
  const earliest = [...versions].sort(
    (left, right) => left.firstSeenAt.getTime() - right.firstSeenAt.getTime(),
  )[0];
  if (earliest === undefined) {
    throw new Error("a change log needs a starting price");
  }
  const line = dateLine(earliest.firstSeenAt, earliest.announcedOn);
  return { dateLine: line, proof: proofForLine(proofs, line) };
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

type ContextSide = "lower" | "upper";

type LaidOutEntry = {
  component: ModelDetailComponent;
  side: ContextSide | null;
  heading: string | null;
  row: ModelDetailPriceRow;
};

type LaidOutPrices = {
  components: ModelDetailPriceRow[];
  groups: ModelDetailPriceGroup[];
  entries: LaidOutEntry[];
};

/**
 * A matching short and long price becomes two tiers. The short tier is
 * first, so the page opens on it. A plain row, such as a cache write
 * with no cutoff, stays on that first tier. One price has no label,
 * and the page draws no tier tabs.
 */
function toTiers(
  shown: readonly ModelDetailComponent[] | null,
  changes: PriceChanges | null,
  history: ModelDetailHistory,
  layout: LaidOutPrices | null,
): ModelDetailTier[] {
  if (shown === null || changes === null || layout === null) {
    return [{ label: null, headlines: [], rows: [], series: history.series }];
  }

  const paired = layout.entries.some((entry) => entry.side !== null);
  if (!paired) {
    return [
      {
        label: null,
        headlines: headlinesFor(shown, changes.latest),
        rows: layout.components,
        series: history.series,
      },
    ];
  }

  const short = layout.entries.filter((entry) => entry.side !== "upper");
  const long = layout.entries.filter((entry) => entry.side === "upper");
  const tiers: ModelDetailTier[] = [];
  if (short.length > 0) {
    tiers.push({
      label: long.length > 0 ? sideHeading(short, "lower") : null,
      headlines: headlinesForRows(
        short.map((entry) => entry.component),
        changes.latest,
      ),
      rows: short.map((entry) => entry.row),
      series: seriesForSide(history.series, "short"),
    });
  }
  if (long.length > 0) {
    tiers.push({
      label: short.length > 0 ? sideHeading(long, "upper") : null,
      headlines: headlinesForRows(
        long.map((entry) => entry.component),
        changes.latest,
      ),
      rows: long.map((entry) => entry.row),
      series: seriesForSide(history.series, "long"),
    });
  }
  if (tiers.length === 1) {
    const only = tiers[0];
    if (only === undefined) {
      return tiers;
    }
    return [{ ...only, label: null, series: history.series }];
  }
  return tiers;
}

function sideHeading(entries: readonly LaidOutEntry[], side: ContextSide): string | null {
  return entries.find((entry) => entry.side === side)?.heading ?? null;
}

function seriesForSide(
  series: readonly PriceHistorySeries[],
  side: "short" | "long",
): PriceHistorySeries[] {
  if (side === "short") {
    return series.filter((item) => !item.id.endsWith(":longContext"));
  }
  return series
    .filter((item) => item.id.endsWith(":longContext"))
    .map((item) => ({
      ...item,
      label: PRICE_DIMENSION_LABELS[item.dimension],
      note: null,
    }));
}

function layoutPrices(
  components: readonly ModelDetailComponent[],
  lastChanges: readonly PriceLastChange[],
): LaidOutPrices {
  const sorted = components
    .map((component) => {
      const dimension = asDimension(component.dimension);
      const siblings = components.filter((item) => item.dimension === component.dimension);
      const bound = matchingContext(siblings);
      const side =
        bound === null ? null : rowSide(component.condition, bound.lower, bound.upper, bound.tokens);
      return {
        component,
        side,
        rank: PRICE_DIMENSIONS.indexOf(dimension),
        groupRank: side === null ? 0 : side === "lower" ? 1 : 2,
        tokens: bound === null || side === null ? 0 : bound.tokens,
        heading:
          bound === null || side === null
            ? null
            : contextHeading(side === "lower" ? bound.lower : bound.upper, bound.tokens),
        conditionLabel: side === null ? conditionLabel(component.condition) : "",
      };
    })
    .sort((left, right) => {
      if (left.groupRank !== right.groupRank) {
        return left.groupRank - right.groupRank;
      }
      if (left.tokens !== right.tokens) {
        return left.tokens - right.tokens;
      }
      if (left.rank !== right.rank) {
        return left.rank - right.rank;
      }
      return left.conditionLabel.localeCompare(right.conditionLabel);
    });

  const entries: LaidOutEntry[] = sorted.map((entry) => {
    const base = baseInput(sorted, entry.side);
    return {
      component: entry.component,
      side: entry.side,
      heading: entry.heading,
      row: {
        dimensionLabel: PRICE_DIMENSION_LABELS[asDimension(entry.component.dimension)],
        amountText: amountText(entry.component),
        conditionLabel: entry.conditionLabel,
        multiplierText: multiplierText(
          entry.component,
          base === null || base.component === entry.component ? null : base.component.amount,
        ),
        lastChange: lastChangeFor(entry.component, lastChanges),
      },
    };
  });

  const groups: ModelDetailPriceGroup[] = [];
  for (const entry of entries) {
    const current = groups[groups.length - 1];
    if (current === undefined || current.heading !== entry.heading) {
      groups.push({ heading: entry.heading, rows: [entry.row] });
      continue;
    }
    current.rows.push(entry.row);
  }

  return { components: entries.map((entry) => entry.row), groups, entries };
}

function baseInput(
  entries: readonly {
    component: ModelDetailComponent;
    side: ContextSide | null;
  }[],
  side: ContextSide | null,
): { component: ModelDetailComponent } | null {
  const paired = entries.some((entry) => entry.side !== null);
  const wanted = side === null && paired ? "lower" : side;
  const found = entries.find(
    (entry) =>
      entry.component.dimension === "input" &&
      entry.side === wanted &&
      AMOUNT.test(entry.component.amount),
  );
  if (found !== undefined) {
    return found;
  }
  if (wanted !== "lower") {
    return null;
  }
  return (
    entries.find(
      (entry) =>
        entry.component.dimension === "input" &&
        entry.side === null &&
        conditionKey(entry.component.condition) === emptyConditionKey() &&
        AMOUNT.test(entry.component.amount),
    ) ?? null
  );
}

function headlinesFor(
  components: readonly ModelDetailComponent[],
  latest: PriceChanges["latest"],
): ModelDetailHeadline[] {
  const headlines: ModelDetailHeadline[] = [];

  for (const dimension of HEADLINE_DIMENSIONS) {
    const row = headlineRow(components, dimension);
    if (row === undefined) {
      continue;
    }
    headlines.push(headlineFrom(row, latest));
  }

  return headlines;
}

function headlinesForRows(
  components: readonly ModelDetailComponent[],
  latest: PriceChanges["latest"],
): ModelDetailHeadline[] {
  const headlines: ModelDetailHeadline[] = [];

  for (const dimension of HEADLINE_DIMENSIONS) {
    const rows = components.filter((component) => component.dimension === dimension);
    const row = rows.length === 1 ? rows[0] : undefined;
    if (row === undefined) {
      continue;
    }
    headlines.push(headlineFrom(row, latest));
  }

  return headlines;
}

function headlineFrom(
  row: ModelDetailComponent,
  latest: PriceChanges["latest"],
): ModelDetailHeadline {
  const change = latest?.changes.find(
    (item) =>
      item.dimension === row.dimension &&
      conditionKey(item.condition) === conditionKey(row.condition) &&
      item.fromAmount !== null &&
      item.toAmount !== null &&
      item.direction !== null &&
      sameAmount(item.toAmount, row.amount),
  );

  return {
    label: PRICE_DIMENSION_LABELS[asDimension(row.dimension)],
    amountText: amountText(row),
    change:
      change === undefined || latest === null || change.fromAmount === null || change.direction === null
        ? null
        : {
            direction: change.direction,
            pctText: change.pctText,
            previousAmountText: `$${change.fromAmount}`,
            previousDateLine: latest.previousDateLine,
          },
  };
}

function toEvent(
  event: NonNullable<PriceChanges["latest"]>,
): Omit<ModelDetailChangeEvent, "proof"> {
  return {
    dateLine: event.dateLine,
    changes: event.changes.map((change) => ({
      dimensionLabel: PRICE_DIMENSION_LABELS[asDimension(change.dimension)],
      conditionLabel: shortConditionLabel(change.condition),
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

function headlineRow(
  components: readonly ModelDetailComponent[],
  dimension: (typeof HEADLINE_DIMENSIONS)[number],
): ModelDetailComponent | undefined {
  const rows = components.filter((component) => component.dimension === dimension);
  const bound = matchingContext(rows);
  if (bound !== null) {
    return rows.find((row) => isBoundRow(row.condition, bound.lower, bound.tokens));
  }
  const plains = rows.filter(
    (component) => conditionKey(component.condition) === emptyConditionKey(),
  );
  return plains.length === 1 ? plains[0] : undefined;
}

function rowSide(
  condition: unknown,
  lower: ContextBoundKey,
  upper: ContextBoundKey,
  tokens: number,
): "lower" | "upper" | null {
  if (isBoundRow(condition, lower, tokens)) {
    return "lower";
  }
  if (isBoundRow(condition, upper, tokens)) {
    return "upper";
  }
  return null;
}

function isBoundRow(condition: unknown, key: ContextBoundKey, tokens: number): boolean {
  return isRecord(condition) && Object.keys(condition).length === 1 && condition[key] === tokens;
}

function multiplierText(component: ModelDetailComponent, baseInput: string | null): string | null {
  if (baseInput === null) {
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
