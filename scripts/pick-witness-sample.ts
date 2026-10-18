export type ModelsDevProvider = {
  id?: string;
  models?: Record<string, unknown>;
};

export type ModelsDevWanted = { provider: string; model: string };

/**
 * Spike examples named in docs/source-spike.md. This is not the MVP catalog.
 * LiteLLM Gemini rows use the `gemini/` prefix; the bare `gemini-*` keys are Vertex.
 */
export const MODELS_DEV_SAMPLE: readonly ModelsDevWanted[] = [
  { provider: "anthropic", model: "claude-haiku-4-5" },
  { provider: "anthropic", model: "claude-haiku-4-5-20251001" },
  { provider: "openai", model: "gpt-5.5" },
  { provider: "google", model: "gemini-3.1-pro-preview" },
  { provider: "google", model: "gemini-2.5-pro" },
  { provider: "google", model: "gemini-4-argon" },
  { provider: "google", model: "gemini-3.8-flash" },
];

export const LITELLM_SAMPLE_KEYS: readonly string[] = [
  "claude-haiku-4-5",
  "claude-haiku-4-5-20251001",
  "gpt-5.5",
  "gemini/gemini-3.1-pro-preview",
  "gemini/gemini-2.5-pro",
  "gemini/gemini-4-argon",
  "gemini/gemini-3.8-flash",
];

export function pickRequiredEntries<T>(
  source: Record<string, T>,
  ids: readonly string[],
): Record<string, T> {
  const missing = ids.filter((id) => !Object.hasOwn(source, id));
  if (missing.length > 0) {
    throw new Error(`missing sample ids: ${missing.join(", ")}`);
  }
  return Object.fromEntries(ids.map((id) => [id, source[id]]));
}

export function pickModelsDevSample(
  api: Record<string, ModelsDevProvider>,
  wanted: readonly ModelsDevWanted[],
): Record<string, { id?: string; models: Record<string, unknown> }> {
  const missing: string[] = [];
  const out: Record<string, { id?: string; models: Record<string, unknown> }> =
    {};

  for (const { provider, model } of wanted) {
    const entry = api[provider]?.models?.[model];
    if (entry === undefined) {
      missing.push(`${provider}/${model}`);
      continue;
    }
    if (!out[provider]) {
      out[provider] = { id: api[provider]?.id, models: {} };
    }
    out[provider].models[model] = entry;
  }

  if (missing.length > 0) {
    throw new Error(`missing sample ids: ${missing.join(", ")}`);
  }
  return out;
}
