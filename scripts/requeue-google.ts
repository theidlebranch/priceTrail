import { createDb } from "@/server/db/client";
import { requeueGoogleOfferingsWithoutPrice } from "@/server/db/requeue-google";
import { redactDatabaseUrl } from "@/server/db/seed";
import { parseDatabaseEnv } from "@/server/env";

/**
 * Put Google models that have no open price back in the review queue.
 *
 * This copies the latest stored snapshot. It does not download a page,
 * and it does not call publishPriceVersion(). A second run throws.
 */
async function main() {
  const { databaseUrl } = parseDatabaseEnv(process.env);
  const { db, close } = createDb(databaseUrl);

  try {
    const result = await db.transaction(async (tx) =>
      requeueGoogleOfferingsWithoutPrice(tx, { fetchedAt: new Date() }),
    );
    console.log(
      `flagged ${result.offeringIds.length} Google offerings on observation ${result.observationId}`,
    );
  } finally {
    await close();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "google requeue failed";
  console.error(redactDatabaseUrl(message));
  process.exit(1);
});
