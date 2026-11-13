import { createDb } from "@/server/db/client";
import { redactDatabaseUrl } from "@/server/db/seed";
import { parseDatabaseEnv } from "@/server/env";
import { readLiteLLMSignal } from "@/server/pipeline/read-litellm-signal";
import { cronRequestAuthorized } from "@/server/pipeline/scheduled-visit";

/**
 * One scheduled read of the LiteLLM cost map.
 *
 * The secret is checked before the database opens. A filed read,
 * including a failed download, is HTTP 200. A throw is HTTP 500.
 * The body leaves out the database URL and the secret.
 * This file does not call publishPriceVersion().
 */
export const maxDuration = 60;

const SCHEDULE_NAME_HEADER = "ce-vssschedulename";
const EXECUTION_ID_HEADER = "ce-id";

export async function POST(request: Request): Promise<Response> {
  if (!cronRequestAuthorized(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  let opened: { close: () => Promise<unknown> } | null = null;
  try {
    const { databaseUrl } = parseDatabaseEnv(process.env);
    const { db, close } = createDb(databaseUrl);
    opened = { close };
    const result = await readLiteLLMSignal(db, { fetchedAt: new Date(), fetchImpl: fetch });
    const body = { signal: "litellm", ...result, ...scheduleFields(request.headers) };
    console.log(JSON.stringify(body));
    return Response.json(body);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "LiteLLM signal failed";
    console.error(redactDatabaseUrl(message));
    return Response.json({ error: "LiteLLM signal failed" }, { status: 500 });
  } finally {
    if (opened !== null) {
      await opened.close();
    }
  }
}

function scheduleFields(headers: Headers): { schedule?: string; executionId?: string } {
  const schedule = headers.get(SCHEDULE_NAME_HEADER)?.trim() ?? "";
  const executionId = headers.get(EXECUTION_ID_HEADER)?.trim() ?? "";
  return {
    ...(schedule === "" ? {} : { schedule }),
    ...(executionId === "" ? {} : { executionId }),
  };
}
