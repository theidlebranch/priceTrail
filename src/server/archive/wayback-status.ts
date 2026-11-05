/**
 * Read Save Page Now 2 JSON without talking to the network.
 *
 * The live API is two steps:
 *   1. POST /save → { url, job_id }  (this is not "archived yet")
 *   2. GET  /save/status/{job_id} → pending | success | error
 *
 * Success does not include a permalink field. Wayback's permalink is
 * https://web.archive.org/web/{timestamp}/{original_url}. If either piece
 * is missing, we cannot claim the page was archived.
 */

export type WaybackStatusResult =
  | { kind: "pending" }
  | {
      kind: "success";
      permalink: string;
      timestamp: string;
      originalUrl: string;
    };

function asRecord(payload: unknown, context: string): Record<string, unknown> {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error(`${context}: expected a JSON object`);
  }
  return payload as Record<string, unknown>;
}

function asNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function requireIaKeys(env: NodeJS.Dict<string>): {
  accessKey: string;
  secretKey: string;
} {
  const accessKey = asNonEmptyString(env.IA_ACCESS_KEY);
  const secretKey = asNonEmptyString(env.IA_SECRET_KEY);

  if (!accessKey) {
    throw new Error("IA_ACCESS_KEY is missing or empty");
  }
  if (!secretKey) {
    throw new Error("IA_SECRET_KEY is missing or empty");
  }

  return { accessKey, secretKey };
}

export function parseCaptureSubmit(payload: unknown): {
  url: string;
  jobId: string;
} {
  const record = asRecord(payload, "capture submit");
  const jobId = asNonEmptyString(record.job_id);
  const url = asNonEmptyString(record.url) ?? "";

  if (!jobId) {
    throw new Error("capture submit is missing job_id; the page is not archived yet");
  }

  return { url, jobId };
}

export function interpretWaybackStatus(payload: unknown): WaybackStatusResult {
  const record = asRecord(payload, "capture status");
  const status = asNonEmptyString(record.status);

  if (status === "pending") {
    return { kind: "pending" };
  }

  if (status === "error") {
    const reason =
      asNonEmptyString(record.message) ??
      asNonEmptyString(record.status_ext) ??
      "unknown error";
    throw new Error(`Wayback capture failed: ${reason}`);
  }

  if (status === "success") {
    const timestamp = asNonEmptyString(record.timestamp);
    const originalUrl = asNonEmptyString(record.original_url);
    if (!timestamp || !originalUrl) {
      throw new Error(
        "success status is missing timestamp or original_url, so no permalink can be built",
      );
    }

    return {
      kind: "success",
      permalink: `https://web.archive.org/web/${timestamp}/${originalUrl}`,
      timestamp,
      originalUrl,
    };
  }

  throw new Error(
    `unrecognized status ${status ? JSON.stringify(status) : "(missing)"}`,
  );
}
