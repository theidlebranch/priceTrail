import { Decimal } from "decimal.js";
import type { Condition, NormalizedPrice } from "@/core/pricing/shape";

/**
 * Compare one LiteLLM parse with the models we already track.
 *
 * This file does not open a database, download a page, or call
 * publishPriceVersion(). A witness amount never becomes a published price.
 * The first read has no previous slug set, so it creates no new-model card.
 */

export type LabSlug = "anthropic" | "openai" | "google";
export type PriceDimension = NormalizedPrice["dimension"];

export type OpenComponent = {
  dimension: PriceDimension;
  amount: string;
  condition: Condition;
};

export type TrackedWitnessModel = {
  modelId: number;
  labSlug: LabSlug;
  modelSlug: string;
  aliases: readonly string[];
  offeringId: number | null;
  openComponents: readonly OpenComponent[];
};

export type CompareLiteLLMInput = {
  rows: readonly NormalizedPrice[];
  tracked: readonly TrackedWitnessModel[];
  /** Null means this is the first successful read. */
  previousSlugs: readonly string[] | null;
  existingCandidateSlugs: readonly string[];
};

export type WitnessDisagreement = {
  offeringId: number;
  modelId: number;
  dimension: PriceDimension;
  ourValue: string;
  aggregatorValue: string;
};

export type WitnessNewModel = {
  labSlug: LabSlug;
  rawSlug: string;
};

export type WitnessModelSignal = {
  modelId: number;
  kind: "not_linked" | "missing";
};

export type CompareLiteLLMResult = {
  seenSlugs: string[];
  isBaseline: boolean;
  agreedCount: number;
  notComparedCount: number;
  disagreements: WitnessDisagreement[];
  newModels: WitnessNewModel[];
  signals: WitnessModelSignal[];
};

const LABS = new Set<LabSlug>(["anthropic", "openai", "google"]);

type WitnessModel = {
  provider: LabSlug;
  amounts: Map<PriceDimension, string>;
};

export function compareLiteLLMWitness(input: CompareLiteLLMInput): CompareLiteLLMResult {
  const witness = indexWitness(input.rows);
  const seenSlugs = [...witness.keys()].sort((left, right) => left.localeCompare(right));
  const seen = new Set(seenSlugs);
  const previous = input.previousSlugs === null ? null : new Set(input.previousSlugs);
  const taken = new Set<string>();

  for (const model of input.tracked) {
    for (const name of namesFor(model)) {
      if (taken.has(name)) {
        throw new Error(`witness name ${name} is linked to two tracked models`);
      }
      taken.add(name);
    }
  }

  const disagreements: WitnessDisagreement[] = [];
  const signals: WitnessModelSignal[] = [];
  let agreedCount = 0;
  let notComparedCount = 0;

  for (const model of input.tracked) {
    const linkedNow = namesFor(model).some((name) => seen.has(name));
    const linkedBefore =
      previous !== null && namesFor(model).some((name) => previous.has(name));

    if (!linkedNow) {
      signals.push({
        modelId: model.modelId,
        kind: linkedBefore ? "missing" : "not_linked",
      });
      continue;
    }

    if (model.offeringId === null) {
      notComparedCount += 1;
      continue;
    }

    const slug = matchedSlug(model, seen);
    const entry = witness.get(slug);
    if (entry === undefined) {
      throw new Error(`linked witness slug ${slug} has no amounts`);
    }

    const compared = compareOpenPrice(model, entry.amounts);
    if (compared.kind === "not_compared") {
      notComparedCount += 1;
      continue;
    }
    if (compared.disagreements.length === 0) {
      agreedCount += 1;
      continue;
    }
    disagreements.push(...compared.disagreements);
  }

  return {
    seenSlugs,
    isBaseline: previous === null,
    agreedCount,
    notComparedCount,
    disagreements,
    newModels: newModels(witness, seen, previous, taken, input.existingCandidateSlugs),
    signals,
  };
}

function namesFor(model: TrackedWitnessModel): string[] {
  return [model.modelSlug, ...model.aliases];
}

function matchedSlug(model: TrackedWitnessModel, seen: ReadonlySet<string>): string {
  const hits = [...new Set(namesFor(model).filter((name) => seen.has(name)))];
  if (hits.length !== 1) {
    throw new Error(`model ${model.modelSlug} matches more than one witness name`);
  }
  const slug = hits[0];
  if (slug === undefined) {
    throw new Error(`model ${model.modelSlug} matches more than one witness name`);
  }
  return slug;
}

function compareOpenPrice(
  model: TrackedWitnessModel,
  amounts: WitnessModel["amounts"],
): { kind: "not_compared" } | { kind: "compared"; disagreements: WitnessDisagreement[] } {
  if (model.offeringId === null) {
    return { kind: "not_compared" };
  }
  const offeringId = model.offeringId;
  const disagreements: WitnessDisagreement[] = [];
  let compared = 0;

  for (const [dimension, witnessAmount] of amounts) {
    const ours = comparableAmounts(model, dimension);
    if (ours.length === 0) {
      continue;
    }
    if (ours.length > 1) {
      throw new Error(`two amounts for ${dimension} on ${model.modelSlug}`);
    }
    const ourValue = ours[0];
    if (ourValue === undefined) {
      throw new Error(`two amounts for ${dimension} on ${model.modelSlug}`);
    }
    compared += 1;
    if (!sameAmount(ourValue, witnessAmount)) {
      disagreements.push({
        offeringId,
        modelId: model.modelId,
        dimension,
        ourValue,
        aggregatorValue: witnessAmount,
      });
    }
  }

  if (compared === 0) {
    return { kind: "not_compared" };
  }
  return { kind: "compared", disagreements };
}

function comparableAmounts(model: TrackedWitnessModel, dimension: PriceDimension): string[] {
  const amounts: string[] = [];
  for (const component of model.openComponents) {
    if (component.dimension !== dimension) {
      continue;
    }
    if (!isComparable(component.condition, model.modelSlug)) {
      continue;
    }
    amounts.push(component.amount);
  }
  return amounts;
}

function isComparable(condition: Condition, modelSlug: string): boolean {
  const long = isLong(condition);
  const short = isShort(condition);
  if (long && short) {
    throw new Error(`condition mixes a short bound and a long bound on ${modelSlug}`);
  }
  return !long;
}

function isLong(condition: Condition): boolean {
  return (
    condition.promptTokensOver !== undefined ||
    condition.promptTokensAtLeast !== undefined ||
    condition.longContext === true
  );
}

function isShort(condition: Condition): boolean {
  return condition.promptTokensAtMost !== undefined || condition.promptTokensUnder !== undefined;
}

function sameAmount(left: string, right: string): boolean {
  let ours: Decimal;
  let witness: Decimal;
  try {
    ours = new Decimal(left);
    witness = new Decimal(right);
  } catch {
    throw new Error("amount is not a decimal");
  }
  if (!ours.isFinite() || !witness.isFinite()) {
    throw new Error("amount is not a decimal");
  }
  return ours.eq(witness);
}

function newModels(
  witness: Map<string, WitnessModel>,
  seen: ReadonlySet<string>,
  previous: ReadonlySet<string> | null,
  taken: ReadonlySet<string>,
  existingCandidateSlugs: readonly string[],
): WitnessNewModel[] {
  if (previous === null) {
    return [];
  }
  const existing = new Set(existingCandidateSlugs);
  const found: WitnessNewModel[] = [];
  for (const slug of [...seen].sort((left, right) => left.localeCompare(right))) {
    if (previous.has(slug) || taken.has(slug) || existing.has(slug)) {
      continue;
    }
    const row = witness.get(slug);
    if (row === undefined) {
      throw new Error(`witness slug ${slug} has no lab`);
    }
    found.push({ labSlug: row.provider, rawSlug: slug });
  }
  return found;
}

function indexWitness(rows: readonly NormalizedPrice[]): Map<string, WitnessModel> {
  const witness = new Map<string, WitnessModel>();
  for (const row of rows) {
    if (row.source !== "litellm") {
      throw new Error(`witness row source is ${row.source}`);
    }
    if (!isLab(row.provider)) {
      throw new Error(`witness lab ${row.provider} is not tracked`);
    }
    if (hasTier(row.condition)) {
      continue;
    }
    const current = witness.get(row.modelSlug) ?? {
      provider: row.provider,
      amounts: new Map(),
    };
    if (current.provider !== row.provider) {
      throw new Error(`witness slug ${row.modelSlug} belongs to two labs`);
    }
    if (current.amounts.has(row.dimension)) {
      throw new Error(`two witness amounts for ${row.dimension} on ${row.modelSlug}`);
    }
    current.amounts.set(row.dimension, row.usdPer1M);
    witness.set(row.modelSlug, current);
  }
  return witness;
}

function hasTier(condition: Condition | undefined): boolean {
  if (condition === undefined) {
    return false;
  }
  return isLong(condition) || isShort(condition);
}

function isLab(value: string): value is LabSlug {
  return LABS.has(value as LabSlug);
}
