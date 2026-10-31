import { createDb } from "@/server/db/client";
import { redactDatabaseUrl, runSeed } from "@/server/db/seed";
import { parseDatabaseEnv } from "@/server/env";

/**
 * Put the hand-checked current prices into the database.
 * This reads the saved fixtures. It does not download a page.
 */
async function main() {
  const { databaseUrl } = parseDatabaseEnv(process.env);
  const { db, close } = createDb(databaseUrl);

  try {
    const result = await runSeed(db);
    console.log(
      `seeded ${result.labs} labs, ${result.models} models, ${result.priceVersions} price versions`,
    );
  } finally {
    await close();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "seed failed";
  console.error(redactDatabaseUrl(message));
  process.exit(1);
});
