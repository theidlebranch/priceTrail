import { createDb } from "@/server/db/client";
import { plantSeedPendingExample, redactDatabaseUrl } from "@/server/db/seed";
import { parseDatabaseEnv } from "@/server/env";

/**
 * Add the example flagged snapshot to a database that was already seeded.
 *
 * This does not publish a price. publishPriceVersion() is not called.
 * A second run finds the flagged row and inserts nothing.
 */
async function main() {
  const { databaseUrl } = parseDatabaseEnv(process.env);
  const { db, close } = createDb(databaseUrl);

  try {
    const result = await db.transaction(async (tx) => plantSeedPendingExample(tx));
    if (result === "inserted") {
      console.log("added one flagged example for claude-mythos-5.1");
    } else {
      console.log("flagged example for claude-mythos-5.1 is already present");
    }
  } finally {
    await close();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "seed pending example failed";
  console.error(redactDatabaseUrl(message));
  process.exit(1);
});
