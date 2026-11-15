/**
 * OpenRouter's public model list is a witness. No API key.
 *
 * Checked on 2026-11-15. The slug is the part after anthropic/, openai/,
 * or google/. Eight tracked models already match that slug. Claude Mythos
 * 5.1 is not in the list, so it has no alias. The note is in
 * docs/source-spike.md.
 */
export const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models";
