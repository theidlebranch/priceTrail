import { formatReviewTimestamp, parseOfficialCandidateId } from "@/app/review/review-list";

export { parseOfficialCandidateId };
import { PRICE_DIMENSION_LABELS, contextHeading } from "@/core/pricing/price-history";
import type { Condition } from "@/core/pricing/shape";
import { componentsForConfirm, ReviewRefusal, type ConfirmPriceComponent } from "@/core/review/confirm-price";

/**
 * Turn official new-model rows into the review list and the detail page.
 *
 * The prices are the ones Add and publish would write for reviewedAt.
 * A day in a gap, or a slug missing from the snapshot, is a sentence
 * and not a throw, so Reject can still be used. This file does not
 * open a database and does not call new Date().
 */

export type OfficialCandidateKind = "new_name" | "retirement" | "gone";

export type OfficialCandidateListRow = {
  id: number;
  status: string;
  kind: string;
  labName: string;
  modelName: string;
  sourceUrl: string;
  firstSeenAt: Date;
};

export type OfficialCandidateListEntry = {
  href: string;
  kind: OfficialCandidateKind;
  labName: string;
  modelName: string;
  sourceUrl: string;
  firstSeenText: string;
};

export type OfficialCandidateDetailRow = {
  id: number;
  status: string;
  kind: string;
  hint: string | null;
  labName: string;
  modelName: string;
  modelSlug: string;
  sourceUrl: string;
  firstSeenAt: Date;
  fetchedAt: Date | null;
  parsedData: unknown;
};

export type OfficialCandidatePrice = {
  dimensionLabel: string;
  amountText: string;
  conditionText: string | null;
};

export type OfficialCandidateDetailView = {
  modelName: string;
  labName: string;
  modelSlug: string;
  sourceUrl: string;
  fetchedAtText: string | null;
  statusText: string;
  prices: OfficialCandidatePrice[] | null;
  refusal: string | null;
  scheduleText: string | null;
  canDecide: boolean;
  candidateId: number;
  decision: "publish" | "accept";
  decisionText: string;
  hint: string | null;
};

const SCHEDULE_TEXT =
  "Add and publish uses the segment that includes the review day. A later segment stays unpublished.";

export function toOfficialCandidateEntries(
  rows: readonly OfficialCandidateListRow[],
): OfficialCandidateListEntry[] {
  const entries = rows.map((row) => {
    if (row.status !== "pending_review") {
      throw new Error(`candidate status ${row.status} is not waiting`);
    }
    const id = parseOfficialCandidateId(String(row.id));
    assertText(row.labName, "lab name");
    assertText(row.modelName, "model name");
    assertText(row.sourceUrl, "source url");
    return {
      href: `/review/candidates/${id}`,
      kind: readKind(row.kind),
      labName: row.labName,
      modelName: row.modelName,
      sourceUrl: row.sourceUrl,
      firstSeenText: formatReviewTimestamp(row.firstSeenAt, "firstSeenAt"),
    };
  });

  const seen = new Set<string>();
  for (const entry of entries) {
    if (seen.has(entry.href)) {
      throw new Error(`two new models share the path ${entry.href}`);
    }
    seen.add(entry.href);
  }
  return entries;
}

export function toOfficialCandidateDetail(
  row: OfficialCandidateDetailRow,
  reviewedAt: Date,
): OfficialCandidateDetailView {
  const candidateId = parseOfficialCandidateId(String(row.id));
  assertText(row.labName, "lab name");
  assertText(row.modelName, "model name");
  assertText(row.modelSlug, "model slug");
  assertText(row.sourceUrl, "source url");
  if (row.status !== "pending_review" && row.status !== "approved" && row.status !== "rejected") {
    throw new Error(`candidate status ${row.status} is not known`);
  }

  const kind = readKind(row.kind);
  const quoted = kind === "new_name" ? quotePrices(row, reviewedAt) : acceptQuote(row);
  const shownAt = kind === "new_name" ? row.fetchedAt : row.firstSeenAt;
  return {
    modelName: row.modelName,
    labName: row.labName,
    modelSlug: row.modelSlug,
    sourceUrl: row.sourceUrl,
    fetchedAtText:
      shownAt === null
        ? null
        : formatReviewTimestamp(shownAt, kind === "new_name" ? "fetchedAt" : "firstSeenAt"),
    statusText: statusText(row.status, kind),
    prices: quoted.prices,
    refusal: quoted.refusal,
    scheduleText: quoted.schedule ? SCHEDULE_TEXT : null,
    canDecide: row.status === "pending_review",
    candidateId,
    decision: kind === "new_name" ? "publish" : "accept",
    decisionText: decisionText(kind),
    hint: quoted.hint,
  };
}

function acceptQuote(row: OfficialCandidateDetailRow): {
  prices: null;
  refusal: null;
  schedule: false;
  hint: string;
} {
  const hint = row.hint?.trim() ?? "";
  if (hint.length === 0) {
    throw new Error("this card has no hint");
  }
  return { prices: null, refusal: null, schedule: false, hint };
}

function quotePrices(
  row: OfficialCandidateDetailRow,
  reviewedAt: Date,
): { prices: OfficialCandidatePrice[] | null; refusal: string | null; schedule: boolean; hint: null } {
  if (row.fetchedAt === null) {
    return {
      prices: null,
      refusal: "This official page has no stored snapshot.",
      schedule: false,
      hint: null,
    };
  }
  const schedule = snapshotHasSchedule(row.parsedData, row.modelSlug);
  try {
    const components = componentsForConfirm(row.parsedData, row.modelSlug, reviewedAt);
    return {
      prices: components.map(toPrice),
      refusal: null,
      schedule,
      hint: null,
    };
  } catch (error) {
    if (error instanceof ReviewRefusal) {
      return { prices: null, refusal: error.message, schedule, hint: null };
    }
    throw error;
  }
}

function toPrice(component: ConfirmPriceComponent): OfficialCandidatePrice {
  return {
    dimensionLabel: PRICE_DIMENSION_LABELS[component.dimension],
    amountText: component.amount,
    conditionText: conditionText(component.condition),
  };
}

function snapshotHasSchedule(parsedData: unknown, modelSlug: string): boolean {
  if (typeof parsedData !== "object" || parsedData === null || !("rows" in parsedData)) {
    return false;
  }
  const rows = parsedData.rows;
  if (!Array.isArray(rows)) {
    return false;
  }
  return rows.some((row) => {
    if (typeof row !== "object" || row === null) {
      return false;
    }
    const slug = "modelSlug" in row ? row.modelSlug : undefined;
    if (slug !== modelSlug) {
      return false;
    }
    return (
      ("validFrom" in row && row.validFrom !== undefined) ||
      ("validUntil" in row && row.validUntil !== undefined)
    );
  });
}

function conditionText(condition: Condition | undefined): string | null {
  if (condition === undefined) {
    return null;
  }
  const parts: string[] = [];
  if (condition.promptTokensAtMost !== undefined) {
    parts.push(contextHeading("promptTokensAtMost", condition.promptTokensAtMost));
  }
  if (condition.promptTokensOver !== undefined) {
    parts.push(contextHeading("promptTokensOver", condition.promptTokensOver));
  }
  if (condition.promptTokensUnder !== undefined) {
    parts.push(contextHeading("promptTokensUnder", condition.promptTokensUnder));
  }
  if (condition.promptTokensAtLeast !== undefined) {
    parts.push(contextHeading("promptTokensAtLeast", condition.promptTokensAtLeast));
  }
  if (condition.longContext === true) {
    parts.push("long context, cutoff not stated");
  }
  return parts.length === 0 ? null : parts.join("; ");
}

function statusText(
  status: "pending_review" | "approved" | "rejected",
  kind: OfficialCandidateKind,
): string {
  if (status === "pending_review") {
    return "Waiting for review.";
  }
  if (status === "approved" && kind === "new_name") {
    return "This model was added and its price was published.";
  }
  if (status === "approved") {
    return "A reviewer accepted this retirement.";
  }
  if (kind === "new_name") {
    return "A reviewer rejected this name.";
  }
  return "A reviewer rejected this retirement.";
}

function decisionText(kind: OfficialCandidateKind): string {
  if (kind === "new_name") {
    return "Add and publish adds this model and publishes this price. Reject leaves it off the catalog.";
  }
  if (kind === "retirement") {
    return "Accept marks this model retired and does not publish a price. Reject leaves it as it is.";
  }
  return "Accept marks this model retired. The published price stays. Reject leaves it current.";
}

function readKind(kind: string): OfficialCandidateKind {
  if (kind === "new_name" || kind === "retirement" || kind === "gone") {
    return kind;
  }
  throw new Error(`candidate kind ${kind} is unknown`);
}

function assertText(value: string, label: string): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} is empty`);
  }
}
