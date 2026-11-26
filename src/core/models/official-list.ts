/**
 * What an official model list means, before any database write.
 *
 * OpenAI, Anthropic, and Google each publish a model list. None of
 * those lists include a price. This file decides which ids are chat
 * models, which token limits we keep, and which ids become a card.
 * A dated snapshot, a moving alias, and a non-chat model never become
 * a card. The first successful read only remembers ids.
 *
 * Tests pass small JSON objects. This file does not download anything.
 */

export type OfficialLab = "openai" | "anthropic" | "google";

export type OfficialModel = {
  slug: string;
  displayName: string | null;
  maxInputTokens: number | null;
  maxOutputTokens: number | null;
  supportedGenerationMethods: readonly string[] | null;
  retiring: boolean;
  hint: string | null;
};

export type OfficialListChange = {
  seenSlugs: string[];
  retiringSlugs: string[];
  isBaseline: boolean;
  limits: {
    slug: string;
    maxInputTokens: number | null;
    maxOutputTokens: number | null;
  }[];
  newNames: { slug: string; rawName: string }[];
  retirements: { slug: string; rawName: string; hint: string }[];
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

// Ends with 2026-03-05, or with 03-2026. The digits are enough. We do
// not check that the month is a real month.
const DATED_SNAPSHOT = /(?:-\d{4}-\d{2}-\d{2}|-\d{2}-\d{4})$/;

const OPENAI_SKIP = [
  "tts",
  "whisper",
  "transcribe",
  "realtime",
  "image",
  "embedding",
  "moderation",
  "search-api",
  "diarize",
  "audio",
] as const;

const GOOGLE_SKIP = [
  "image",
  "tts",
  "embed",
  "lyria",
  "transcribe",
  "live",
  "robot",
  "audio",
  "music",
  "aqa",
  "decision",
] as const;

const TOKEN_FORMAT = new Intl.NumberFormat("en-US");

export function parseOpenAiModelList(payload: unknown): OfficialModel[] {
  return readRows(payload, "data", "OpenAI model list").map((row, index) => {
    const record = readRecord(row, `OpenAI model list row ${index + 1}`);
    const slug = readSlug(record.id, `OpenAI model list row ${index + 1}`);
    const shutdown = readOptionalString(record.shutdown_date, `OpenAI model ${slug} shutdown_date`);
    const retiring = shutdown !== null;
    return {
      slug,
      displayName: null,
      maxInputTokens: null,
      maxOutputTokens: null,
      supportedGenerationMethods: null,
      retiring,
      hint: retiring ? `Shutdown date ${shutdown}.` : null,
    };
  });
}

export function parseAnthropicModelList(payload: unknown): OfficialModel[] {
  return readRows(payload, "data", "Anthropic model list").map((row, index) => {
    const record = readRecord(row, `Anthropic model list row ${index + 1}`);
    const slug = readSlug(record.id, `Anthropic model list row ${index + 1}`);
    const where = `Anthropic model ${slug}`;
    const lifecycle = readLifecycle(record.lifecycle, where);
    const deprecatedAt = readOptionalString(record.deprecated_at, `${where} deprecated_at`);
    const retiresAt = readOptionalString(record.retires_at, `${where} retires_at`);
    const retiring = lifecycle === "deprecated" || lifecycle === "retired";
    return {
      slug,
      displayName: readOptionalString(record.display_name, `${where} display_name`),
      maxInputTokens: readTokenCount(record.max_input_tokens, `${where} max_input_tokens`),
      maxOutputTokens: readTokenCount(record.max_tokens, `${where} max_tokens`),
      supportedGenerationMethods: null,
      retiring,
      hint: retiring ? anthropicHint(lifecycle, deprecatedAt, retiresAt) : null,
    };
  });
}

export function parseGoogleModelList(payload: unknown): OfficialModel[] {
  return readRows(payload, "models", "Google model list").map((row, index) => {
    const record = readRecord(row, `Google model list row ${index + 1}`);
    const slug = googleSlug(record.name, `Google model list row ${index + 1}`);
    const where = `Google model ${slug}`;
    return {
      slug,
      displayName: readOptionalString(record.displayName, `${where} displayName`),
      maxInputTokens: readTokenCount(record.inputTokenLimit, `${where} inputTokenLimit`),
      maxOutputTokens: readTokenCount(record.outputTokenLimit, `${where} outputTokenLimit`),
      supportedGenerationMethods: readMethods(record.supportedGenerationMethods, where),
      retiring: false,
      hint: null,
    };
  });
}

/**
 * True when this id can become a card.
 *
 * A dated snapshot and a moving alias are skipped for every lab.
 * OpenAI has no method field, so the id itself has to look like chat.
 * Google has to list generateContent and must not be image, music,
 * or another non-chat product. Anthropic's list is chat models.
 */
export function isOfficialChatModel(
  lab: OfficialLab,
  model: Pick<OfficialModel, "slug" | "supportedGenerationMethods">,
): boolean {
  const slug = model.slug.toLowerCase();
  if (DATED_SNAPSHOT.test(slug) || slug.endsWith("-latest")) {
    return false;
  }
  if (lab === "anthropic") {
    return true;
  }
  if (lab === "openai") {
    if (slug.startsWith("text-") || slug.startsWith("omni-")) {
      return false;
    }
    return !OPENAI_SKIP.some((part) => slug.includes(part));
  }
  const methods = model.supportedGenerationMethods ?? [];
  if (!methods.includes("generateContent")) {
    return false;
  }
  return !GOOGLE_SKIP.some((part) => slug.includes(part));
}

/**
 * The cards and the token limits for one parsed list.
 *
 * previousSeenSlugs null means this is the first successful read. That
 * read stores ids and limits and opens no card. A later read opens a
 * new-name card for a chat id we do not track, and a retirement card
 * when a chat id is newly retiring. One slug gets one card. Retirement
 * wins when both apply. A slug that already has a card is left alone.
 * OpenAI never produces a limit. Google never produces a retirement.
 */
export function classifyOfficialList(input: {
  lab: OfficialLab;
  models: readonly OfficialModel[];
  trackedSlugs: ReadonlySet<string>;
  previousSeenSlugs: readonly string[] | null;
  previousRetiringSlugs: readonly string[];
  existingCandidateSlugs: ReadonlySet<string>;
}): OfficialListChange {
  const seen = new Set<string>();
  for (const model of input.models) {
    if (seen.has(model.slug)) {
      throw new Error(`${input.lab} model list repeats ${model.slug}`);
    }
    seen.add(model.slug);
  }

  const chat = input.models.filter((model) => isOfficialChatModel(input.lab, model));
  const seenSlugs = sorted(chat.map((model) => model.slug));
  const retiringSlugs = sorted(chat.filter((model) => model.retiring).map((model) => model.slug));
  const limits =
    input.lab === "openai"
      ? []
      : input.models
          .filter(
            (model) =>
              input.trackedSlugs.has(model.slug) &&
              (model.maxInputTokens !== null || model.maxOutputTokens !== null),
          )
          .map((model) => ({
            slug: model.slug,
            maxInputTokens: model.maxInputTokens,
            maxOutputTokens: model.maxOutputTokens,
          }))
          .sort((left, right) => left.slug.localeCompare(right.slug));

  if (input.previousSeenSlugs === null) {
    return {
      seenSlugs,
      retiringSlugs,
      isBaseline: true,
      limits,
      newNames: [],
      retirements: [],
    };
  }

  const seenBefore = new Set(input.previousSeenSlugs);
  const retiringBefore = new Set(input.previousRetiringSlugs);
  const newNames: OfficialListChange["newNames"] = [];
  const retirements: OfficialListChange["retirements"] = [];
  for (const model of chat) {
    if (input.existingCandidateSlugs.has(model.slug)) {
      continue;
    }
    const rawName = model.displayName ?? model.slug;
    if (model.retiring && !retiringBefore.has(model.slug)) {
      if (model.hint === null || model.hint.trim() === "") {
        throw new Error(`retiring model ${model.slug} has no hint`);
      }
      retirements.push({ slug: model.slug, rawName, hint: model.hint });
      continue;
    }
    if (!input.trackedSlugs.has(model.slug) && !seenBefore.has(model.slug)) {
      newNames.push({ slug: model.slug, rawName });
    }
  }

  return {
    seenSlugs,
    retiringSlugs,
    isBaseline: false,
    limits,
    newNames: newNames.sort((left, right) => left.slug.localeCompare(right.slug)),
    retirements: retirements.sort((left, right) => left.slug.localeCompare(right.slug)),
  };
}

/**
 * The model-page sentence. The day is the UTC day of observedAt.
 * This function does not call new Date().
 */
export function tokenLimitSentence(input: {
  maxInputTokens: number | null;
  maxOutputTokens: number | null;
  observedAt: Date;
  listName: string;
}): string {
  if (!(input.observedAt instanceof Date) || Number.isNaN(input.observedAt.getTime())) {
    throw new Error("token limit day is not a real date");
  }
  const listName = input.listName.trim();
  if (listName === "") {
    throw new Error("token limit list name is empty");
  }
  const parts: string[] = [];
  if (input.maxInputTokens !== null) {
    parts.push(`input limit ${formatTokens(input.maxInputTokens)} tokens`);
  }
  if (input.maxOutputTokens !== null) {
    parts.push(`output limit ${formatTokens(input.maxOutputTokens)} tokens`);
  }
  if (parts.length === 0) {
    throw new Error("token limit has no count");
  }
  const day = `${MONTHS[input.observedAt.getUTCMonth()]} ${input.observedAt.getUTCDate()}, ${input.observedAt.getUTCFullYear()}`;
  return `${parts.join(", ")}, read from the ${listName} model list on ${day} UTC.`;
}

function anthropicHint(
  lifecycle: "active" | "deprecated" | "retired" | null,
  deprecatedAt: string | null,
  retiresAt: string | null,
): string {
  const parts = [`Lifecycle ${lifecycle ?? "unknown"}.`];
  if (deprecatedAt !== null) {
    parts.push(`Deprecated at ${deprecatedAt}.`);
  }
  if (retiresAt !== null) {
    parts.push(`Retires at ${retiresAt}.`);
  }
  return parts.join(" ");
}

function formatTokens(value: number): string {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error("token limit is not a positive whole number");
  }
  return TOKEN_FORMAT.format(value);
}

function readRows(payload: unknown, key: "data" | "models", label: string): unknown[] {
  const record = readRecord(payload, label);
  const rows = record[key];
  if (!Array.isArray(rows)) {
    throw new Error(`${label} ${key} is not a list`);
  }
  return rows;
}

function readRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} is not an object`);
  }
  return value as Record<string, unknown>;
}

function readSlug(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim() === "" || value.includes("/")) {
    throw new Error(`${label} id is missing`);
  }
  return value.trim();
}

function googleSlug(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.startsWith("models/")) {
    throw new Error(`${label} name is missing`);
  }
  const slug = value.slice("models/".length).trim();
  if (slug === "" || slug.includes("/")) {
    throw new Error(`${label} name is missing`);
  }
  return slug;
}

function readOptionalString(value: unknown, label: string): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== "string") {
    throw new Error(`${label} is not text`);
  }
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function readTokenCount(value: unknown, label: string): number | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${label} is not a positive whole number`);
  }
  return value;
}

function readLifecycle(
  value: unknown,
  where: string,
): "active" | "deprecated" | "retired" | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (value === "active" || value === "deprecated" || value === "retired") {
    return value;
  }
  throw new Error(`${where} lifecycle is not active, deprecated, or retired`);
}

function readMethods(value: unknown, where: string): string[] {
  if (value === undefined || value === null) {
    return [];
  }
  if (!Array.isArray(value) || value.some((method) => typeof method !== "string")) {
    throw new Error(`${where} supportedGenerationMethods is not a list of text`);
  }
  return value;
}

function sorted(slugs: readonly string[]): string[] {
  return [...slugs].sort((left, right) => left.localeCompare(right));
}
