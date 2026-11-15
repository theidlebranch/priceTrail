import type { NormalizedPrice } from "@/core/pricing/shape";

/**
 * Names on an official pricing page that we do not track yet.
 *
 * A tracked slug is skipped. A slug that already has a candidate row is
 * skipped, including a rejected one, so it does not come back. Two prices
 * for one slug are one card. This function does not open a database.
 */

export type OfficialCandidateCard = {
  modelName: string;
  modelSlug: string;
};

export function officialCandidateCards(input: {
  rows: readonly NormalizedPrice[];
  trackedSlugs: readonly string[];
  existingCandidateSlugs: readonly string[];
}): OfficialCandidateCard[] {
  const tracked = new Set(input.trackedSlugs);
  const existing = new Set(input.existingCandidateSlugs);
  const names = new Map<string, string>();

  for (const row of input.rows) {
    if (row.source !== "official") {
      throw new Error(`price row source is ${row.source}; only an official page can open a model card`);
    }
    if (
      row.modelSlug.length === 0 ||
      row.modelSlug.includes("/") ||
      row.modelSlug === "." ||
      row.modelSlug === ".."
    ) {
      throw new Error(`model slug is empty, contains a slash, or is "." or ".."`);
    }
    const current = names.get(row.modelSlug);
    if (current === undefined) {
      names.set(row.modelSlug, row.modelName);
      continue;
    }
    if (current !== row.modelName) {
      throw new Error(`official slug ${row.modelSlug} has two names`);
    }
  }

  return [...names.entries()]
    .filter(([slug]) => !tracked.has(slug) && !existing.has(slug))
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([modelSlug, modelName]) => ({ modelName, modelSlug }));
}
