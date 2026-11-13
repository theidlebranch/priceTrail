import { createDb } from "@/server/db/client";
import { linkExistingPriceEvidence } from "@/server/db/publish-price-version";
import { redactDatabaseUrl } from "@/server/db/seed";
import { parseDatabaseEnv } from "@/server/env";

/**
 * Point published prices at the snapshot that opened them.
 *
 * A version is linked when one ok or confirmed item on that offering was
 * fetched at the version's first_seen_at. This does not download a page
 * and it does not publish a price.
 */
async function main() {
  const { databaseUrl } = parseDatabaseEnv(process.env);
  const { db, close } = createDb(databaseUrl);

  try {
    const result = await linkExistingPriceEvidence(db);
    console.log(`linked ${result.linked}`);
    console.log(`left ${result.left}`);
  } finally {
    await close();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "link price evidence failed";
  console.error(redactDatabaseUrl(message));
  process.exit(1);
});
