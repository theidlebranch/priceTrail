import { createDb } from "@/server/db/client";
import { plantLiteLLMAliases } from "@/server/db/litellm-aliases";
import { redactDatabaseUrl } from "@/server/db/seed";
import { parseDatabaseEnv } from "@/server/env";

/**
 * Store the checked LiteLLM names. A second run inserts nothing.
 * This does not call publishPriceVersion().
 */
async function main() {
  const { databaseUrl } = parseDatabaseEnv(process.env);
  const { db, close } = createDb(databaseUrl);
  try {
    const result = await plantLiteLLMAliases(db);
    console.log(`litellm aliases inserted: ${result.inserted}`);
  } finally {
    await close();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "LiteLLM aliases failed";
  console.error(redactDatabaseUrl(message));
  process.exit(1);
});
