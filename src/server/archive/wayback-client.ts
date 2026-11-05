import type { FetchLike } from "@/server/sources/provider-source";
import { interpretWaybackStatus, parseCaptureSubmit } from "@/server/archive/wayback-status";

/**
 * Ask the Wayback Machine to save one page, then wait for the job.
 *
 * A finished POST is only a job id. It is not a permalink. The permalink
 * is built later, from the status timestamp and the original URL.
 * Tests pass fetch, now, and sleep so they never call archive.org and
 * never wait the real three minutes.
 *
 * A Wayback failure returns failed. It does not throw. Missing keys are
 * the caller's problem: archiveObservation() checks those before this runs.
 */

const SAVE_URL = "https://web.archive.org/save";
const USER_AGENT = "PriceTrail/0.1 (pricing evidence checker)";
const POLL_MS = 5_000;
const TIMEOUT_MS = 180_000;
const REQUEST_TIMEOUT_MS = 30_000;

// Save Page Now job ids are a UUID or a hex token with a short prefix.
// Anything else is refused before it is placed in the status URL.
const JOB_ID_PATTERN = /^[A-Za-z0-9-]+$/;

export type CaptureDeps = {
  fetchImpl: FetchLike;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
  accessKey: string;
  secretKey: string;
};

export type CaptureResult =
  | { kind: "archived"; permalink: string }
  | { kind: "failed"; reason: string };

export async function capturePage(pageUrl: string, deps: CaptureDeps): Promise<CaptureResult> {
  if (pageUrl.trim() === "") {
    return { kind: "failed", reason: "page URL is blank" };
  }
  if (deps.accessKey.trim() === "" || deps.secretKey.trim() === "") {
    throw new Error("IA keys are missing or empty");
  }

  try {
    return await runCapture(pageUrl, deps);
  } catch (error) {
    return { kind: "failed", reason: redactFailure(error, deps) };
  }
}

async function runCapture(pageUrl: string, deps: CaptureDeps): Promise<CaptureResult> {
  const started = deps.now();
  const submitted = parseCaptureSubmit(
    await readJson(await submitCapture(pageUrl, deps), "capture submit"),
  );
  assertSafeJobId(submitted.jobId);

  while (deps.now() - started < TIMEOUT_MS) {
    const parsed = interpretWaybackStatus(
      await readJson(await pollStatus(submitted.jobId, deps), "capture status"),
    );
    if (parsed.kind === "success") {
      return { kind: "archived", permalink: parsed.permalink };
    }
    await deps.sleep(POLL_MS);
  }

  return {
    kind: "failed",
    reason: `Wayback capture timed out after ${TIMEOUT_MS / 1000}s`,
  };
}

function assertSafeJobId(jobId: string): void {
  if (!JOB_ID_PATTERN.test(jobId)) {
    throw new Error("job_id is not safe to poll");
  }
}

async function submitCapture(pageUrl: string, deps: CaptureDeps): Promise<Response> {
  return deps.fetchImpl(SAVE_URL, {
    method: "POST",
    headers: {
      ...authHeaders(deps),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ url: pageUrl }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
}

async function pollStatus(jobId: string, deps: CaptureDeps): Promise<Response> {
  return deps.fetchImpl(`${SAVE_URL}/status/${jobId}`, {
    method: "GET",
    headers: authHeaders(deps),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
}

function authHeaders(deps: CaptureDeps): HeadersInit {
  return {
    Accept: "application/json",
    Authorization: `LOW ${deps.accessKey}:${deps.secretKey}`,
    "User-Agent": USER_AGENT,
  };
}

/**
 * Read one Save Page Now response.
 * The body of an error is thrown away. It can be large, and it might
 * repeat a request header. The status code is enough to say the call failed.
 */
async function readJson(response: Response, context: string): Promise<unknown> {
  if (!response.ok) {
    throw new Error(`${context}: HTTP ${response.status}`);
  }
  const text = await response.text();
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error(`${context}: response was not JSON`);
  }
}

/**
 * A thrown fetch error can include the Authorization value, because the
 * caller built that header. Strip the keys and the header before the
 * reason is returned to anyone else.
 */
function redactFailure(error: unknown, deps: CaptureDeps): string {
  const message = error instanceof Error ? error.message : "Wayback capture failed";
  const withoutHeader = message
    .replace(/Authorization:\s*LOW\s+\S+/gi, "[redacted]")
    .replace(/\bLOW\s+\S+/g, "[redacted]");
  return hideSecret(hideSecret(withoutHeader, deps.secretKey), deps.accessKey);
}

function hideSecret(message: string, secret: string): string {
  if (secret.trim() === "") {
    return message;
  }
  return message.split(secret).join("[redacted]");
}
