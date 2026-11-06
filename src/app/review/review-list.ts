/**
 * Turn waiting review rows into the links /review renders.
 *
 * This file does not open a database and does not call new Date().
 * The query already kept official flagged items and ordered them.
 * This function still refuses a row that is not waiting, an id that
 * is not one path segment, or two rows that would open the same page.
 * An empty array is a real empty queue, not an error.
 *
 * The time is the UTC clock time of the snapshot. A date-only label
 * would hide two checks on the same day.
 */

export type ReviewListRow = {
  id: number;
  reviewStatus: string;
  labName: string;
  modelName: string;
  sourceUrl: string;
  fetchedAt: Date;
  reviewNote: string | null;
};

export type ReviewListEntry = {
  href: string;
  labName: string;
  modelName: string;
  sourceUrl: string;
  fetchedAtText: string;
  reviewNote: string | null;
};

const ITEM_ID = /^[1-9][0-9]*$/;

/**
 * The path segment for /review/items/<id>. A leading zero, a sign, or
 * a decimal is not the id the database stored. Encoding is not applied:
 * a whole number has no character that would split the path.
 */
export function parseReviewItemId(segment: string): number {
  if (!ITEM_ID.test(segment)) {
    throw new Error("Review item id is not a whole number.");
  }
  const id = Number(segment);
  if (!Number.isSafeInteger(id)) {
    throw new Error("Review item id is not a whole number.");
  }
  return id;
}

export function toReviewListEntries(rows: readonly ReviewListRow[]): ReviewListEntry[] {
  const entries = rows.map((row) => {
    if (row.reviewStatus !== "flagged") {
      throw new Error(`review status ${row.reviewStatus} is not waiting`);
    }
    const id = parseReviewItemId(String(row.id));
    assertText(row.labName, "lab name");
    assertText(row.modelName, "model name");
    assertText(row.sourceUrl, "source url");
    if (row.reviewNote !== null && typeof row.reviewNote !== "string") {
      throw new Error("review note is not text");
    }

    return {
      href: `/review/items/${id}`,
      labName: row.labName,
      modelName: row.modelName,
      sourceUrl: row.sourceUrl,
      fetchedAtText: formatReviewTimestamp(row.fetchedAt, "fetchedAt"),
      reviewNote: row.reviewNote,
    };
  });

  const seen = new Set<string>();
  for (const entry of entries) {
    if (seen.has(entry.href)) {
      throw new Error(`two review items share the path ${entry.href}`);
    }
    seen.add(entry.href);
  }

  return entries;
}

export function formatReviewTimestamp(value: Date, label: string): string {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new Error(`${label} is not a real date`);
  }
  const iso = value.toISOString();
  return `${iso.slice(0, 10)} ${iso.slice(11, 19)} UTC`;
}

function assertText(value: string, label: string): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} is empty`);
  }
}
