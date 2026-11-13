import { createDb } from "@/server/db/client";
import { redactDatabaseUrl } from "@/server/db/seed";
import { parseDatabaseEnv } from "@/server/env";
import { readLiteLLMSignal } from "@/server/pipeline/read-litellm-signal";

/**
 * Read the LiteLLM cost map once. The schedule calls the same function.
 * This does not call publishPriceVersion().
 */
async function main() {
  const { databaseUrl } = parseDatabaseEnv(process.env);
  const { db, close } = createDb(databaseUrl);
  try {
    const result = await readLiteLLMSignal(db, { fetchedAt: new Date(), fetchImpl: fetch });
    console.log(JSON.stringify({ signal: "litellm", ...result }));
  } finally {
    await close();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "LiteLLM signal failed";
  console.error(redactDatabaseUrl(message));
  process.exit(1);
});
