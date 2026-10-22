import { Decimal } from "decimal.js";
import { z } from "zod";
import { normalizedPriceSchema, type NormalizedPrice } from "./shape";

/**
 * LiteLLM stores USD per token. The shared shape stores USD per 1M tokens.
 * Multiply with decimal.js. Never use JavaScript's own multiplication,
 * because binary floats cannot represent values like 0.00000125 exactly.
 */
const TOKENS_PER_MILLION = 1_000_000;

const PROVIDER_BY_LITELLM = {
  anthropic: "anthropic",
  openai: "openai",
  gemini: "google",
} as const;

type LiteLLMProvider = keyof typeof PROVIDER_BY_LITELLM;
type Provider = (typeof PROVIDER_BY_LITELLM)[LiteLLMProvider];

const COST_KEY_TO_DIMENSION = {
  input_cost_per_token: "input",
  output_cost_per_token: "output",
  cache_read_input_token_cost: "cache_read",
  cache_creation_input_token_cost: "cache_write_5m",
  cache_creation_input_token_cost_above_1hr: "cache_write_1h",
} as const;

type LiteLLMDimension =
  (typeof COST_KEY_TO_DIMENSION)[keyof typeof COST_KEY_TO_DIMENSION];

/**
 * Batch, Flex, and Priority are other modes. They are out of the MVP.
 * A field that ends with one of these is ignored, even when it also
 * carries a context-tier suffix.
 */
const OUT_OF_MVP_SUFFIXES = ["_batches", "_flex", "_priority"] as const;

const CONTEXT_SPLIT = /_above_(\d+)k_tokens$/;
const DATED_SNAPSHOT = /^(.*)-(\d{8})$/;

const payloadSchema = z.record(z.string(), z.unknown());

type ParsedModel = {
  provider: Provider;
  modelName: string;
  modelSlug: string;
  amounts: Partial<Record<LiteLLMDimension, string>>;
};

/**
 * Read a LiteLLM cost map into the shared price shape.
 * This is a witness. It does not publish a price.
 */
export function parseLiteLLM(payload: unknown): {
  rows: NormalizedPrice[];
  warnings: string[];
} {
  const parsed = payloadSchema.parse(payload);
  const warnings: string[] = [];
  const models: ParsedModel[] = [];

  for (const [key, raw] of Object.entries(parsed)) {
    const model = readKeptModel(key, raw, warnings);
    if (model) {
      models.push(model);
    }
  }

  if (models.length === 0) {
    throw new Error("no kept chat rows");
  }

  const rows = collapseDatedSnapshots(models, warnings);
  return { rows, warnings: [...new Set(warnings)] };
}

function readKeptModel(
  key: string,
  raw: unknown,
  warnings: string[],
): ParsedModel | null {
  const entry = asRecord(key, raw);
  if (!isKeptProvider(entry.litellm_provider)) {
    return null;
  }

  if (!Object.hasOwn(entry, "mode")) {
    throw new Error(`missing mode for ${key}`);
  }
  if (typeof entry.mode !== "string") {
    throw new Error(`mode is not a string for ${key}`);
  }
  if (entry.mode !== "chat") {
    return null;
  }

  const identity = identityFor(key, entry.litellm_provider);
  const amounts = readCosts(entry, identity.modelSlug, warnings);
  return { ...identity, amounts };
}

function asRecord(key: string, raw: unknown): Record<string, unknown> {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`model entry is not an object: ${key}`);
  }
  return raw as Record<string, unknown>;
}

function isKeptProvider(value: unknown): value is LiteLLMProvider {
  return typeof value === "string" && Object.hasOwn(PROVIDER_BY_LITELLM, value);
}

function identityFor(
  key: string,
  litellmProvider: LiteLLMProvider,
): Pick<ParsedModel, "provider" | "modelName" | "modelSlug"> {
  let id = key;
  if (litellmProvider === "gemini") {
    const prefix = "gemini/";
    if (!key.startsWith(prefix) || key.length === prefix.length) {
      throw new Error(`gemini key must start with gemini/: ${key}`);
    }
    id = key.slice(prefix.length);
  }

  const bare = stripDatedSnapshot(id);
  if (!bare) {
    throw new Error(`empty model id for ${key}`);
  }

  return {
    provider: PROVIDER_BY_LITELLM[litellmProvider],
    modelName: bare,
    modelSlug: bare,
  };
}

function stripDatedSnapshot(id: string): string {
  const match = DATED_SNAPSHOT.exec(id);
  if (!match?.[1]) {
    return id;
  }
  return match[1];
}

function readCosts(
  entry: Record<string, unknown>,
  modelSlug: string,
  warnings: string[],
): Partial<Record<LiteLLMDimension, string>> {
  const amounts: Partial<Record<LiteLLMDimension, string>> = {};
  const splitThresholds = new Set<number>();

  for (const [field, value] of Object.entries(entry)) {
    if (field === "litellm_provider" || field === "mode") {
      continue;
    }

    const base = withoutOutOfMvpSuffix(field);
    if (base === null) {
      continue;
    }

    if (isMappedCostField(base)) {
      amounts[COST_KEY_TO_DIMENSION[base]] = perMillion(value, field, modelSlug);
      continue;
    }

    const split = CONTEXT_SPLIT.exec(base);
    if (split?.[1]) {
      // The number in the field name is only a warning. Copying it into
      // `condition` would pretend LiteLLM is the source of a tier boundary.
      splitThresholds.add(Number(split[1]));
      continue;
    }

    if (/cost|price/i.test(base)) {
      warnings.push(`unmapped cost field ${field} for ${modelSlug}`);
    }
  }

  if (amounts.input === undefined) {
    throw new Error(`missing input_cost_per_token for ${modelSlug}`);
  }
  if (amounts.output === undefined) {
    throw new Error(`missing output_cost_per_token for ${modelSlug}`);
  }

  if (splitThresholds.size > 0) {
    const listed = [...splitThresholds]
      .sort((a, b) => a - b)
      .map((threshold) => `above_${threshold}k_tokens`)
      .join(", ");
    warnings.push(`context split not mapped for ${modelSlug}: ${listed}`);
  }

  return amounts;
}

function isMappedCostField(
  field: string,
): field is keyof typeof COST_KEY_TO_DIMENSION {
  return Object.hasOwn(COST_KEY_TO_DIMENSION, field);
}

function withoutOutOfMvpSuffix(field: string): string | null {
  let base = field;
  let stripped = false;
  let changed = true;

  while (changed) {
    changed = false;
    for (const suffix of OUT_OF_MVP_SUFFIXES) {
      if (base.endsWith(suffix) && base.length > suffix.length) {
        base = base.slice(0, -suffix.length);
        stripped = true;
        changed = true;
      }
    }
  }

  return stripped ? null : base;
}

function perMillion(value: unknown, field: string, modelSlug: string): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(
      `cost ${field} is not a finite number for ${modelSlug}: ${String(value)}`,
    );
  }
  if (value < 0) {
    throw new Error(`cost ${field} is negative for ${modelSlug}`);
  }
  return new Decimal(String(value)).mul(TOKENS_PER_MILLION).toFixed();
}

function collapseDatedSnapshots(
  models: ParsedModel[],
  warnings: string[],
): NormalizedPrice[] {
  const groups = new Map<
    string,
    {
      provider: Provider;
      modelName: string;
      modelSlug: string;
      amounts: Map<LiteLLMDimension, string[]>;
    }
  >();

  for (const model of models) {
    const groupKey = `${model.provider}:${model.modelSlug}`;
    let group = groups.get(groupKey);
    if (!group) {
      group = {
        provider: model.provider,
        modelName: model.modelName,
        modelSlug: model.modelSlug,
        amounts: new Map(),
      };
      groups.set(groupKey, group);
    }

    for (const [dimension, amount] of Object.entries(model.amounts) as [
      LiteLLMDimension,
      string,
    ][]) {
      const seen = group.amounts.get(dimension) ?? [];
      if (
        !seen.some((existing) =>
          new Decimal(existing).equals(new Decimal(amount)),
        )
      ) {
        seen.push(amount);
      }
      group.amounts.set(dimension, seen);
    }
  }

  const rows: NormalizedPrice[] = [];
  for (const group of groups.values()) {
    for (const [dimension, amounts] of group.amounts) {
      if (amounts.length > 1) {
        warnings.push(
          `dated snapshots disagree on ${group.modelSlug} ${dimension}: ${amounts.join(", ")}`,
        );
        continue;
      }
      rows.push(
        normalizedPriceSchema.parse({
          provider: group.provider,
          modelName: group.modelName,
          modelSlug: group.modelSlug,
          dimension,
          usdPer1M: amounts[0],
          source: "litellm",
        }),
      );
    }
  }
  return rows;
}
