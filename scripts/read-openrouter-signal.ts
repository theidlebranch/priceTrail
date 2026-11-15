import { createDb } from "@/server/db/client";
import { redactDatabaseUrl } from "@/server/db/seed";
import { parseDatabaseEnv } from "@/server/env";
import { readOpenRouterSignal } from "@/server/pipeline/read-openrouter-signal";

/**
 * Read OpenRouter's model list once. The schedule calls the same function.
 * This does not call publishPriceVersion().
 */
async function main() {
  const { databaseUrl } = parseDatabaseEnv(process.env);
  const { db, close } = createDb(databaseUrl);
  try {
    const result = await readOpenRouterSignal(db, { fetchedAt: new Date(), fetchImpl: fetch });
    console.log(JSON.stringify({ signal: "openrouter", ...result }));
  } finally {
    await close();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "OpenRouter signal failed";
  console.error(redactDatabaseUrl(message));
  process.exit(1);
});
