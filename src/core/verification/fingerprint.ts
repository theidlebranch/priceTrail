import { createHash } from "node:crypto";
import type { NormalizedPrice } from "@/core/pricing/shape";

/**
 * Fingerprint of one parsed page.
 *
 * The hash covers the rows and the warnings, not the raw page. Markup
 * can change without a price changing. Rows are sorted, and so are the
 * keys inside each row, so the same prices in a different order stay
 * the same hash. JSON.stringify alone would treat that reorder as a
 * change.
 *
 * Amounts stay the text the parser returned. "1" and "1.0" are different
 * fingerprints. Comparing them as the same number would hide a parser
 * change. This function does not read a database and does not call new Date().
 */

export function fingerprintParsedPrices(input: {
  rows: readonly NormalizedPrice[];
  warnings: readonly string[];
}): string {
  const rows = [...input.rows].sort(compareRows);
  const warnings = [...input.warnings].sort();
  return sha256(stableStringify({ rows, warnings }));
}

function compareRows(left: NormalizedPrice, right: NormalizedPrice): number {
  const leftKey = stableStringify(left);
  const rightKey = stableStringify(right);
  if (leftKey < rightKey) {
    return -1;
  }
  if (leftKey > rightKey) {
    return 1;
  }
  return 0;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/**
 * JSON with object keys sorted. Undefined fields are left out, so a
 * missing condition and a condition that was never set hash the same.
 */
function stableStringify(value: unknown): string {
  if (value === undefined) {
    return "null";
  }
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "null";
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  const record = value as Record<string, unknown>;
  const keys = Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort();
  const body = keys.map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(",");
  return `{${body}}`;
}
