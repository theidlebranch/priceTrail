import { spawn } from "node:child_process";
import {
  interpretWaybackStatus,
  parseCaptureSubmit,
  requireIaKeys,
} from "./wayback-status";

/**
 * One-URL Save Page Now spike. This is not the production archive client
 * (that is build-plan step 24). We are learning: request shape, timing,
 * whether the archived copy still contains prices.
 *
 * Anthropic's markdown page is the easiest official source. If Wayback
 * cannot archive this one, that is a Tier 3 problem, not a Google-HTML
 * problem.
 */
const TARGET_URL =
  "https://platform.claude.com/docs/en/about-claude/pricing.md";
const SAVE_URL = "https://web.archive.org/save";
const POLL_MS = 5_000;
const TIMEOUT_MS = 180_000;
const SUCCESS_SOUND = "/System/Library/Sounds/Glass.aiff";
const FAILURE_SOUND = "/System/Library/Sounds/Basso.aiff";

function countPrices(text: string): number {
  return (text.match(/\$\s?\d+(\.\d+)?/g) ?? []).length;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function playSound(file: string): Promise<void> {
  return new Promise((resolve) => {
    const child = spawn("afplay", [file], { stdio: "ignore" });
    child.on("error", (err: Error) => {
      console.error(`could not play sound: ${err.message}`);
      resolve();
    });
    child.on("close", (code) => {
      if (code !== 0) {
        console.error(`afplay exited with code ${code}`);
      }
      resolve();
    });
  });
}

function authHeaders(accessKey: string, secretKey: string): HeadersInit {
  return {
    Accept: "application/json",
    Authorization: `LOW ${accessKey}:${secretKey}`,
    "User-Agent": "PriceTrail-spike/0.1 (personal research project)",
  };
}

async function readJson(res: Response, context: string): Promise<unknown> {
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${context}: HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error(`${context}: response was not JSON`);
  }
}

async function submitCapture(
  headers: HeadersInit,
): Promise<{ jobId: string; url: string }> {
  const body = new URLSearchParams({ url: TARGET_URL });
  const res = await fetch(SAVE_URL, {
    method: "POST",
    headers: {
      ...headers,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  return parseCaptureSubmit(await readJson(res, "capture submit"));
}

async function pollUntilDone(
  jobId: string,
  headers: HeadersInit,
  startedAt: number,
): Promise<ReturnType<typeof interpretWaybackStatus> & { kind: "success" }> {
  while (Date.now() - startedAt < TIMEOUT_MS) {
    const res = await fetch(`${SAVE_URL}/status/${jobId}`, { headers });
    const parsed = interpretWaybackStatus(
      await readJson(res, "capture status"),
    );

    if (parsed.kind === "success") {
      return parsed;
    }

    const elapsedSec = Math.round((Date.now() - startedAt) / 1000);
    console.log(`status: pending (${elapsedSec}s)`);
    await sleep(POLL_MS);
  }

  throw new Error(
    `Wayback capture timed out after ${TIMEOUT_MS / 1000}s (job_id ${jobId})`,
  );
}

async function checkPermalink(permalink: string): Promise<{
  httpStatus: number;
  sizeKb: number;
  dollarAmounts: number;
  readable: boolean;
}> {
  const res = await fetch(permalink, {
    headers: {
      "User-Agent": "PriceTrail-spike/0.1 (personal research project)",
    },
  });
  const body = await res.text();
  const dollarAmounts = countPrices(body);
  return {
    httpStatus: res.status,
    sizeKb: Math.round(body.length / 1024),
    dollarAmounts,
    readable: res.ok && dollarAmounts > 0,
  };
}

async function main(): Promise<void> {
  const { accessKey, secretKey } = requireIaKeys(process.env);
  const headers = authHeaders(accessKey, secretKey);
  const startedAt = Date.now();

  console.log(`== wayback spike ==`);
  console.log("url:", TARGET_URL);

  const submitted = await submitCapture(headers);
  console.log("job_id:", submitted.jobId);
  console.log("submit is not a finished archive; polling status…");

  const done = await pollUntilDone(submitted.jobId, headers, startedAt);
  const elapsedMs = Date.now() - startedAt;
  console.log("status: success");
  console.log("elapsed (ms):", elapsedMs);
  console.log("timestamp:", done.timestamp);
  console.log("permalink:", done.permalink);

  const archived = await checkPermalink(done.permalink);
  console.log("archive http status:", archived.httpStatus);
  console.log("archive size (KB):", archived.sizeKb);
  console.log("dollar amounts found:", archived.dollarAmounts);
  console.log("readable:", archived.readable ? "yes" : "no");

  await playSound(SUCCESS_SOUND);
}

main()
  .catch(async (err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    await playSound(FAILURE_SOUND);
    process.exit(1);
  });
