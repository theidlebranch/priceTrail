import { Decimal } from "decimal.js";
import { z } from "zod";
import { normalizedPriceSchema, type NormalizedPrice } from "./shape";

const COST_KEY_TO_DIMENSION = {
  input: "input",
  output: "output",
  cache_read: "cache_read",
  cache_write: "cache_write_5m",
} as const;

type ModelsDevDimension =
  (typeof COST_KEY_TO_DIMENSION)[keyof typeof COST_KEY_TO_DIMENSION];

const KNOWN_COST_KEYS = new Set<string>(Object.keys(COST_KEY_TO_DIMENSION));

const modelsDevPayloadSchema = z.record(z.string(), z.unknown());

const modelsDevProviderSchema = z.looseObject({
  id: z.string().optional(),
  models: z.record(z.string(), z.unknown()).optional(),
});

const modelsDevModelSchema = z.looseObject({
  name: z.string().min(1),
  cost: z.record(z.string(), z.unknown()).optional(),
});

export type ModelsDevParseResult = {
  rows: NormalizedPrice[];
  warnings: string[];
};

type ParsedModel = {
  modelName: string;
  modelSlug: string;
  amounts: Partial<Record<ModelsDevDimension, string>>;
};

export function parseModelsDevAnthropic(payload: unknown): ModelsDevParseResult {
  const parsed = modelsDevPayloadSchema.parse(payload);
  if (!Object.hasOwn(parsed, "anthropic")) {
    throw new Error("no anthropic provider");
  }

  const anthropic = modelsDevProviderSchema.parse(parsed.anthropic);
  const models = anthropic.models ?? {};
  const modelIds = Object.keys(models);
  if (modelIds.length === 0) {
    throw new Error("zero anthropic models");
  }

  const warnings: string[] = [];
  const parsedModels: ParsedModel[] = [];

  for (const [modelId, rawModel] of Object.entries(models)) {
    const model = modelsDevModelSchema.parse(rawModel);
    const modelName = cleanDisplayName(model.name);
    const modelSlug = pageLabelSlug(modelName);

    warnings.push(...modeBlockWarnings(model, modelName));

    if (model.cost === undefined) {
      throw new Error(`missing cost for ${modelId}`);
    }

    parsedModels.push({
      modelName,
      modelSlug,
      amounts: parseCost(model.cost, modelName),
    });
  }

  return { rows: collapseAliases(parsedModels, warnings), warnings };
}

function parseCost(
  cost: Record<string, unknown>,
  modelName: string,
): Partial<Record<ModelsDevDimension, string>> {
  const unknownKeys = Object.keys(cost).filter((key) => !KNOWN_COST_KEYS.has(key));
  if (unknownKeys.length > 0) {
    throw new Error(`unknown cost key: ${unknownKeys.join(", ")}`);
  }
  if (!Object.hasOwn(cost, "input")) {
    throw new Error(`missing input in cost for ${modelName}`);
  }
  if (!Object.hasOwn(cost, "output")) {
    throw new Error(`missing output in cost for ${modelName}`);
  }

  const amounts: Partial<Record<ModelsDevDimension, string>> = {};
  for (const [key, dimension] of Object.entries(COST_KEY_TO_DIMENSION) as [
    keyof typeof COST_KEY_TO_DIMENSION,
    ModelsDevDimension,
  ][]) {
    if (!Object.hasOwn(cost, key)) {
      continue;
    }
    const value = cost[key];
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new Error(
        `cost ${key} is not a finite number for ${modelName}: ${String(value)}`,
      );
    }
    amounts[dimension] = new Decimal(String(value)).toFixed();
  }
  return amounts;
}

function collapseAliases(
  models: ParsedModel[],
  warnings: string[],
): NormalizedPrice[] {
  const groups = new Map<
    string,
    { modelName: string; amounts: Map<ModelsDevDimension, string[]> }
  >();

  for (const model of models) {
    let group = groups.get(model.modelSlug);
    if (!group) {
      group = { modelName: model.modelName, amounts: new Map() };
      groups.set(model.modelSlug, group);
    }
    for (const [dimension, amount] of Object.entries(model.amounts) as [
      ModelsDevDimension,
      string,
    ][]) {
      const seen = group.amounts.get(dimension) ?? [];
      if (!seen.some((existing) => new Decimal(existing).equals(new Decimal(amount)))) {
        seen.push(amount);
      }
      group.amounts.set(dimension, seen);
    }
  }

  const rows: NormalizedPrice[] = [];
  for (const [modelSlug, group] of groups) {
    for (const [dimension, amounts] of group.amounts) {
      if (amounts.length > 1) {
        warnings.push(
          `aliases disagree on ${modelSlug} ${dimension}: ${amounts.join(", ")}`,
        );
        continue;
      }
      rows.push(
        normalizedPriceSchema.parse({
          provider: "anthropic",
          modelName: group.modelName,
          modelSlug,
          dimension,
          usdPer1M: amounts[0],
          source: "models.dev",
        }),
      );
    }
  }
  return rows;
}

function cleanDisplayName(name: string): string {
  const trimmed = name.replace(/\s+/g, " ").trim();
  const withoutLatest = trimmed.replace(/\s*\(latest\)\s*$/i, "").trim();
  if (/\(|\)/.test(withoutLatest)) {
    throw new Error(
      `unallowed parenthetical in model name (only a trailing (latest) is stripped): ${name}`,
    );
  }
  if (!withoutLatest) {
    throw new Error("empty model name after stripping (latest)");
  }
  return withoutLatest;
}

function pageLabelSlug(modelName: string): string {
  return modelName
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function modeBlockWarnings(
  model: Record<string, unknown>,
  modelName: string,
): string[] {
  const warnings: string[] = [];
  for (const [key, value] of Object.entries(model)) {
    if (key === "cost") {
      continue;
    }
    if (containsCost(value)) {
      warnings.push(
        `ignored nested cost in mode block '${key}' for ${modelName}`,
      );
    }
  }
  return warnings;
}

function containsCost(value: unknown): boolean {
  if (value === null || typeof value !== "object") {
    return false;
  }
  if (Array.isArray(value)) {
    return value.some(containsCost);
  }
  const record = value as Record<string, unknown>;
  if (Object.hasOwn(record, "cost")) {
    return true;
  }
  return Object.values(record).some(containsCost);
}
