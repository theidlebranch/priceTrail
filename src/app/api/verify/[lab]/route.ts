import { createDb } from "@/server/db/client";
import { respondToSchedule, runProductionVisit } from "@/server/pipeline/scheduled-visit";

/**
 * One lab, started by a Vercel schedule.
 *
 * vercel.json names three paths: /api/verify/anthropic at minute 0,
 * /api/verify/openai at minute 10, and /api/verify/google at minute 20.
 * Each request is its own function run, so a slow Wayback wait on one
 * lab cannot cancel the others. 300 seconds is the longest a Hobby
 * function may run. One download plus one archive wait fits in that.
 *
 * This file does not call publishPriceVersion().
 */
export const maxDuration = 300;

export async function POST(
  request: Request,
  context: { params: Promise<{ lab: string }> },
): Promise<Response> {
  const { lab } = await context.params;
  return respondToSchedule({
    lab,
    authorization: request.headers.get("authorization"),
    headers: request.headers,
    env: process.env,
    openDb: createDb,
    runVisit: runProductionVisit(process.env),
  });
}
