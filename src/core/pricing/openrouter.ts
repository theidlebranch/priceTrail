import { Decimal } from "decimal.js";
import { normalizedPriceSchema, type NormalizedPrice } from "./shape";

/**
 * OpenRouter stores USD per token, as a decimal string. The shared shape
 * stores USD per 1M tokens. Multiply with decimal.js. Never use
 * JavaScript's own multiplication, because binary floats cannot represent
 * values like 0.00000125 exactly.
 *
 * This is a witness. It does not publish a price.
 */
const TOKENS_PER_MILLION = 1_000_000;

const LAB_PREFIX = {
  "anthropic/": "anthropic",
  "openai/": "openai",
  "google/": "google",
} as const;

type Lab = (typeof LAB_PREFIX)[keyof typeof LAB_PREFIX];

const PRICE_FIELD = {
  prompt: "input",
  completion: "output",
  input_cache_read: "cache_read",
  input_cache_write: "cache_write_5m",
  input_cache_write_1h: "cache_write_1h",
} as const;

type OpenRouterDimension = (typeof PRICE_FIELD)[keyof typeof PRICE_FIELD];

const BASE_FIELDS = ["prompt", "completion"] as const;

type KeptModel = {
  provider: Lab;
  modelName: string;
  modelSlug: string;
  amounts: Map<OpenRouterDimension, string>;
};

/**
 * Read OpenRouter's public model list into the shared price shape.
 * A `:batch` or `:free` id is another billing mode, so it is a warning.
 * A long-context override stays a warning. The base prompt is the short price.
 */
export function parseOpenRouter(payload: unknown): {
  rows: NormalizedPrice[];
  warnings: string[];
} {
  const warnings: string[] = [];
  const kept = new Map<string, KeptModel>();

  for (const raw of readData(payload)) {
    const model = readModel(raw, warnings);
    if (model === null) {
      continue;
    }
    if (kept.has(model.modelSlug)) {
      throw new Error(`two OpenRouter rows for ${model.modelSlug}`);
    }
    kept.set(model.modelSlug, model);
  }

  if (kept.size === 0) {
    throw new Error("no kept chat rows");
  }

  const rows: NormalizedPrice[] = [];
  for (const model of kept.values()) {
    for (const [dimension, usdPer1M] of model.amounts) {
      rows.push(
        normalizedPriceSchema.parse({
          provider: model.provider,
          modelName: model.modelName,
          modelSlug: model.modelSlug,
          dimension,
          usdPer1M,
          source: "openrouter",
        }),
      );
    }
  }

  return { rows, warnings: [...new Set(warnings)] };
}

function readData(payload: unknown): unknown[] {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("OpenRouter payload has no data list");
  }
  const data = (payload as { data?: unknown }).data;
  if (!Array.isArray(data)) {
    throw new Error("OpenRouter payload has no data list");
  }
  return data;
}

function readModel(raw: unknown, warnings: string[]): KeptModel | null {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("model entry is not an object");
  }
  const entry = raw as { id?: unknown; name?: unknown; pricing?: unknown };
  if (typeof entry.id !== "string" || entry.id.trim() === "") {
    throw new Error("model id is not a string");
  }
  const id = entry.id;
  const lab = labFor(id);
  if (lab === null) {
    return null;
  }
  if (id.includes(":")) {
    warnings.push(`skipped variant ${id}`);
    return null;
  }

  const modelSlug = id.slice(labPrefix(lab).length);
  if (modelSlug.trim() === "") {
    throw new Error(`empty model id for ${id}`);
  }

  if (entry.pricing === null || typeof entry.pricing !== "object" || Array.isArray(entry.pricing)) {
    warnings.push(`skipped model with no token price: ${id}`);
    return null;
  }
  const pricing = entry.pricing as Record<string, unknown>;
  if (isUnknownBasePrice(pricing)) {
    warnings.push(`skipped unknown price for ${modelSlug}`);
    return null;
  }
  if (!hasBasePrice(pricing)) {
    warnings.push(`skipped model with no token price: ${id}`);
    return null;
  }

  const amounts = new Map<OpenRouterDimension, string>();
  amounts.set("input", perMillion(pricing.prompt, "prompt", modelSlug));
  amounts.set("output", perMillion(pricing.completion, "completion", modelSlug));

  for (const field of ["input_cache_read", "input_cache_write", "input_cache_write_1h"] as const) {
    if (!Object.hasOwn(pricing, field)) {
      continue;
    }
    if (pricing[field] === "-1") {
      warnings.push(`skipped unknown ${field} for ${modelSlug}`);
      continue;
    }
    amounts.set(PRICE_FIELD[field], perMillion(pricing[field], field, modelSlug));
  }

  if (Object.hasOwn(pricing, "overrides")) {
    warnings.push(`long-context price not compared for ${modelSlug}`);
  }

  const unmapped = Object.keys(pricing)
    .filter((field) => !Object.hasOwn(PRICE_FIELD, field) && field !== "overrides")
    .sort((left, right) => left.localeCompare(right));
  if (unmapped.length > 0) {
    warnings.push(`unmapped price fields for ${modelSlug}: ${unmapped.join(", ")}`);
  }

  return {
    provider: lab,
    modelName: displayName(entry.name, modelSlug),
    modelSlug,
    amounts,
  };
}

function labFor(id: string): Lab | null {
  for (const [prefix, lab] of Object.entries(LAB_PREFIX)) {
    if (id.startsWith(prefix)) {
      return lab;
    }
  }
  return null;
}

function labPrefix(lab: Lab): string {
  for (const [prefix, owner] of Object.entries(LAB_PREFIX)) {
    if (owner === lab) {
      return prefix;
    }
  }
  throw new Error(`witness lab ${lab} has no OpenRouter prefix`);
}

function displayName(name: unknown, modelSlug: string): string {
  if (typeof name === "string" && name.trim() !== "") {
    return name.trim();
  }
  return modelSlug;
}

function hasBasePrice(pricing: Record<string, unknown>): boolean {
  return BASE_FIELDS.every((field) => Object.hasOwn(pricing, field) && pricing[field] !== undefined);
}

function isUnknownBasePrice(pricing: Record<string, unknown>): boolean {
  return pricing.prompt === "-1" || pricing.completion === "-1";
}

function perMillion(value: unknown, field: string, modelSlug: string): string {
  if (typeof value !== "string" || !/^\d+(\.\d+)?$/.test(value)) {
    throw new Error(`price ${field} is not a decimal string for ${modelSlug}`);
  }
  let amount: Decimal;
  try {
    amount = new Decimal(value);
  } catch {
    throw new Error(`price ${field} is not a decimal string for ${modelSlug}`);
  }
  if (!amount.isFinite() || amount.isNegative()) {
    throw new Error(`price ${field} is not a decimal string for ${modelSlug}`);
  }
  return amount.mul(TOKENS_PER_MILLION).toFixed();
}
