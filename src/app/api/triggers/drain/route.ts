import { createDb } from "@/server/db/client";
import { respondToTriggerDrain, runPendingTriggers } from "@/server/pipeline/run-pending-triggers";

/**
 * One pending disagreement trigger, started by a Vercel schedule.
 *
 * vercel.json calls this path at minute 50, 52, and 54. Each request is
 * its own function run, so a slow Wayback wait cannot cancel the next
 * page. 300 seconds is the longest a Hobby function may run.
 *
 * This file does not call publishPriceVersion().
 */
export const maxDuration = 300;

export async function POST(request: Request): Promise<Response> {
  const now = new Date();
  return respondToTriggerDrain({
    authorization: request.headers.get("authorization"),
    headers: request.headers,
    env: process.env,
    openDb: createDb,
    runDrain: (db) =>
      runPendingTriggers(db, {
        fetchedAt: now,
        processedAt: now,
        fetchImpl: fetch,
        env: process.env,
        now: () => Date.now(),
        sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
      }),
  });
}
