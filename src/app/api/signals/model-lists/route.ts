import { createDb } from "@/server/db/client";
import { redactSecrets } from "@/server/db/seed";
import { parseDatabaseEnv } from "@/server/env";
import {
  readOfficialModelListKeys,
  readOfficialModelLists,
} from "@/server/pipeline/read-official-model-lists";
import { cronRequestAuthorized } from "@/server/pipeline/scheduled-visit";

/**
 * One scheduled read of the OpenAI, Anthropic, and Google model lists.
 *
 * The secret is checked before the database opens. A missing key skips
 * that lab. A filed read, including a failed download, is HTTP 200.
 * A throw is HTTP 500. The body leaves out keys and the database URL.
 * This file does not call publishPriceVersion().
 */
export const maxDuration = 60;

const SCHEDULE_NAME_HEADER = "ce-vssschedulename";
const EXECUTION_ID_HEADER = "ce-id";

export async function POST(request: Request): Promise<Response> {
  if (!cronRequestAuthorized(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const keys = readOfficialModelListKeys(process.env);
  const secrets = [keys.openai, keys.anthropic, keys.google].filter((key): key is string => key !== null);
  let opened: { close: () => Promise<unknown> } | null = null;
  try {
    const { databaseUrl } = parseDatabaseEnv(process.env);
    const { db, close } = createDb(databaseUrl);
    opened = { close };
    const result = await readOfficialModelLists(db, {
      fetchedAt: new Date(),
      fetchImpl: fetch,
      keys,
    });
    const body = { signal: "model-lists", ...result, ...scheduleFields(request.headers) };
    const line = redactSecrets(JSON.stringify(body), secrets);
    console.log(line);
    return Response.json(JSON.parse(line) as unknown);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "model list read failed";
    console.error(redactSecrets(message, secrets));
    return Response.json({ error: "model list read failed" }, { status: 500 });
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
