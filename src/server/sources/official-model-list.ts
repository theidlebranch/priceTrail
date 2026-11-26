import { fetchOfficialPage, type FetchLike } from "@/server/sources/provider-source";

/**
 * The three official model lists.
 *
 * The key stays in a header. It is never added to the query string.
 * Anthropic's retired models use the query name lifecycle[], and a
 * later page uses after_id. Google's next page uses nextPageToken.
 * This file downloads and merges pages. It does not decide which ids
 * become cards, and it does not write a price.
 */

export const OPENAI_MODELS_URL = "https://api.openai.com/v1/models";
export const ANTHROPIC_MODELS_URL = "https://api.anthropic.com/v1/models";
export const GOOGLE_MODELS_URL = "https://generativelanguage.googleapis.com/v1beta/models";

export const OFFICIAL_MODEL_LIST_URLS = [
  OPENAI_MODELS_URL,
  ANTHROPIC_MODELS_URL,
  GOOGLE_MODELS_URL,
] as const;

const ANTHROPIC_VERSION = "2026-10-21";
const PAGE_LIMIT = 10;

export type OfficialListLab = "openai" | "anthropic" | "google";

export class OfficialListReadError extends Error {
  readonly outcome: "fetch_error" | "parse_error";

  constructor(outcome: "fetch_error" | "parse_error", message: string) {
    super(message);
    this.name = "OfficialListReadError";
    this.outcome = outcome;
  }
}

export function isOfficialModelListUrl(
  url: string,
): url is (typeof OFFICIAL_MODEL_LIST_URLS)[number] {
  return (OFFICIAL_MODEL_LIST_URLS as readonly string[]).includes(url);
}

export function officialModelListName(url: string): "OpenAI" | "Anthropic" | "Google" | null {
  if (url === OPENAI_MODELS_URL) {
    return "OpenAI";
  }
  if (url === ANTHROPIC_MODELS_URL) {
    return "Anthropic";
  }
  if (url === GOOGLE_MODELS_URL) {
    return "Google";
  }
  return null;
}

export function blankKey(value: string | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * Download one lab's list and merge every page into one object.
 * The returned shape is what the core parser expects.
 */
export async function downloadOfficialModelList(
  lab: OfficialListLab,
  key: string,
  fetchImpl: FetchLike,
): Promise<unknown> {
  if (lab === "openai") {
    return fetchJson(OPENAI_MODELS_URL, "OpenAI model list", fetchImpl, {
      Authorization: `Bearer ${key}`,
    });
  }
  if (lab === "anthropic") {
    const headers = {
      Authorization: `Bearer ${key}`,
      "anthropic-version": ANTHROPIC_VERSION,
    };
    const current = await followAnthropic(headers, fetchImpl, new URLSearchParams({ limit: "1000" }));
    const retiredQuery = new URLSearchParams({ limit: "1000" });
    retiredQuery.append("lifecycle[]", "retired");
    const retired = await followAnthropic(headers, fetchImpl, retiredQuery);
    const byId = new Map<string, unknown>();
    for (const row of [...current, ...retired]) {
      const id = rowId(row);
      byId.set(id, row);
    }
    return { data: [...byId.values()] };
  }
  return followGoogle(key, fetchImpl);
}

async function followAnthropic(
  headers: Record<string, string>,
  fetchImpl: FetchLike,
  query: URLSearchParams,
): Promise<unknown[]> {
  const rows: unknown[] = [];
  let afterId: string | null = null;
  for (let page = 0; page < PAGE_LIMIT; page += 1) {
    const params = new URLSearchParams(query);
    if (afterId !== null) {
      params.set("after_id", afterId);
    }
    const payload = await fetchJson(
      `${ANTHROPIC_MODELS_URL}?${params.toString()}`,
      "Anthropic model list",
      fetchImpl,
      headers,
    );
    const record = readObject(payload, "Anthropic model list");
    if (!Array.isArray(record.data)) {
      throw new OfficialListReadError("parse_error", "Anthropic model list data is not a list");
    }
    rows.push(...record.data);
    if (record.has_more !== true) {
      return rows;
    }
    if (typeof record.last_id !== "string" || record.last_id.trim() === "") {
      throw new OfficialListReadError("parse_error", "Anthropic model list has more pages and no after id");
    }
    if (record.last_id === afterId) {
      throw new OfficialListReadError("parse_error", "Anthropic model list repeated a page");
    }
    afterId = record.last_id;
  }
  throw new OfficialListReadError("fetch_error", "Anthropic model list did not finish");
}

async function followGoogle(key: string, fetchImpl: FetchLike): Promise<unknown> {
  const models: unknown[] = [];
  let pageToken: string | null = null;
  for (let page = 0; page < PAGE_LIMIT; page += 1) {
    const params = new URLSearchParams({ pageSize: "1000" });
    if (pageToken !== null) {
      params.set("pageToken", pageToken);
    }
    const payload = await fetchJson(
      `${GOOGLE_MODELS_URL}?${params.toString()}`,
      "Google model list",
      fetchImpl,
      { "x-goog-api-key": key },
    );
    const record = readObject(payload, "Google model list");
    if (!Array.isArray(record.models)) {
      throw new OfficialListReadError("parse_error", "Google model list models is not a list");
    }
    models.push(...record.models);
    if (typeof record.nextPageToken !== "string" || record.nextPageToken.trim() === "") {
      return { models };
    }
    if (record.nextPageToken === pageToken) {
      throw new OfficialListReadError("parse_error", "Google model list repeated a page");
    }
    pageToken = record.nextPageToken;
  }
  throw new OfficialListReadError("fetch_error", "Google model list did not finish");
}

async function fetchJson(
  url: string,
  label: string,
  fetchImpl: FetchLike,
  headers: Record<string, string>,
): Promise<unknown> {
  let rawContent: string;
  try {
    const page = await fetchOfficialPage(url, label, fetchImpl, headers);
    rawContent = page.rawContent;
  } catch (error) {
    const message = error instanceof Error ? error.message : `${label} fetch failed`;
    throw new OfficialListReadError("fetch_error", message);
  }
  try {
    return JSON.parse(rawContent) as unknown;
  } catch {
    throw new OfficialListReadError("parse_error", `${label} response is not JSON`);
  }
}

function readObject(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new OfficialListReadError("parse_error", `${label} is not an object`);
  }
  return value as Record<string, unknown>;
}

function rowId(row: unknown): string {
  if (typeof row !== "object" || row === null || Array.isArray(row)) {
    throw new OfficialListReadError("parse_error", "Anthropic model list row is not an object");
  }
  const id = (row as { id?: unknown }).id;
  if (typeof id !== "string" || id.trim() === "") {
    throw new OfficialListReadError("parse_error", "Anthropic model list row has no id");
  }
  return id;
}
