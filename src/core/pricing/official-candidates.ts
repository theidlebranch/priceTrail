import type { NormalizedPrice } from "@/core/pricing/shape";

/**
 * Cards from one official pricing page.
 *
 * A new-model card is an untracked slug whose note does not say retired
 * or deprecated. A retirement card is any slug whose note does say that.
 * Only that note counts. A gone card is a tracked model missing from two
 * good visits. A failed download or a suspect parse does not count and
 * does not reset the previous good miss. This file does not open a
 * database and does not publish a price.
 */

const RETIREMENT_NOTE = /\b(?:retired|deprecated)\b/i;

export type OfficialCandidateCard = {
  modelName: string;
  modelSlug: string;
};

export type PricingRetirementCard = {
  modelName: string;
  modelSlug: string;
  hint: string;
};

export type PricingVisit = {
  outcome: "unchanged" | "changed" | "parser_suspect" | "fetch_error";
  presentSlugs: readonly string[];
};

export type GoneModelCard = {
  modelName: string;
  modelSlug: string;
  hint: string;
};

const GONE_HINT = "Missing from two good pricing visits.";

export function officialCandidateCards(input: {
  rows: readonly NormalizedPrice[];
  trackedSlugs: readonly string[];
  existingCandidateSlugs: readonly string[];
}): OfficialCandidateCard[] {
  const tracked = new Set(input.trackedSlugs);
  const existing = new Set(input.existingCandidateSlugs);
  return [...indexOfficialRows(input.rows).entries()]
    .filter(([slug, row]) => row.hint === null && !tracked.has(slug) && !existing.has(slug))
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([modelSlug, row]) => ({ modelName: row.modelName, modelSlug }));
}

export function pricingRetirementCards(input: {
  rows: readonly NormalizedPrice[];
  existingCandidateSlugs: readonly string[];
}): PricingRetirementCard[] {
  const existing = new Set(input.existingCandidateSlugs);
  return [...indexOfficialRows(input.rows).entries()]
    .filter((entry): entry is [string, { modelName: string; hint: string }] => {
      const [slug, row] = entry;
      return row.hint !== null && !existing.has(slug);
    })
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([modelSlug, row]) => ({ modelName: row.modelName, modelSlug, hint: row.hint }));
}

/**
 * Visits are newest first. A suspect or failed visit is skipped. A good
 * visit that includes the model ends the streak. Two misses in a row,
 * with bad visits allowed between them, open one card.
 */
export function goneModelCards(input: {
  visits: readonly PricingVisit[];
  tracked: readonly { slug: string; name: string }[];
  existingCandidateSlugs: readonly string[];
}): GoneModelCard[] {
  const existing = new Set(input.existingCandidateSlugs);
  const cards: GoneModelCard[] = [];
  for (const model of [...input.tracked].sort((left, right) => left.slug.localeCompare(right.slug))) {
    if (existing.has(model.slug)) {
      continue;
    }
    if (model.name.trim().length === 0) {
      throw new Error(`tracked model ${model.slug} has no name`);
    }
    if (missStreak(input.visits, model.slug) >= 2) {
      cards.push({ modelName: model.name, modelSlug: model.slug, hint: GONE_HINT });
    }
  }
  return cards;
}

function missStreak(visits: readonly PricingVisit[], slug: string): number {
  let streak = 0;
  for (const visit of visits) {
    if (visit.outcome === "parser_suspect" || visit.outcome === "fetch_error") {
      continue;
    }
    if (visit.presentSlugs.includes(slug)) {
      break;
    }
    streak += 1;
  }
  return streak;
}

function indexOfficialRows(
  rows: readonly NormalizedPrice[],
): Map<string, { modelName: string; hint: string | null }> {
  const names = new Map<string, { modelName: string; hint: string | null }>();
  for (const row of rows) {
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
    const hint = retirementHint(row.note);
    const current = names.get(row.modelSlug);
    if (current === undefined) {
      names.set(row.modelSlug, { modelName: row.modelName, hint });
      continue;
    }
    if (current.modelName !== row.modelName) {
      throw new Error(`official slug ${row.modelSlug} has two names`);
    }
    if (hint === null || current.hint === null) {
      current.hint = current.hint ?? hint;
      continue;
    }
    if (hint.toLowerCase() !== current.hint.toLowerCase()) {
      throw new Error(`official slug ${row.modelSlug} has two retirement notes`);
    }
  }
  return names;
}

function retirementHint(note: string | undefined): string | null {
  if (note === undefined) {
    return null;
  }
  const trimmed = note.trim();
  if (trimmed.length === 0 || !RETIREMENT_NOTE.test(trimmed)) {
    return null;
  }
  return trimmed;
}
