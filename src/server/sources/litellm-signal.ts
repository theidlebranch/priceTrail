/**
 * The LiteLLM cost map is a witness. These names were checked on
 * 2026-11-13 against the raw file. The note is in docs/source-spike.md.
 *
 * Anthropic's page slugs use a dot. LiteLLM uses a hyphen, so those two
 * need an alias. The OpenAI and Google slugs already match the kept
 * chat keys, so they have no alias here.
 */
export const LITELLM_COST_MAP_URL =
  "https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json";

export const LITELLM_AGGREGATOR_ALIASES = [
  { labSlug: "anthropic", modelSlug: "claude-fable-5.1", alias: "claude-fable-5-1" },
  { labSlug: "anthropic", modelSlug: "claude-mythos-5.1", alias: "claude-mythos-5-1" },
] as const;
