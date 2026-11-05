import { createDb } from "@/server/db/client";
import { plantGoogleCatalog } from "@/server/db/google-catalog";
import { redactDatabaseUrl } from "@/server/db/seed";
import { parseDatabaseEnv } from "@/server/env";

/**
 * Add the Google lab, three models, and the official pricing page.
 *
 * This does not publish a price. publishPriceVersion() is not called.
 * A second run throws because the lab is already there. It does not
 * delete rows and it does not add a second copy.
 */
async function main() {
  const { databaseUrl } = parseDatabaseEnv(process.env);
  const { db, close } = createDb(databaseUrl);

  try {
    const result = await db.transaction(async (tx) => plantGoogleCatalog(tx));
    console.log(
      `google catalog: 1 lab, ${result.modelIds.length} models, ${result.offeringIds.length} offerings, no prices`,
    );
  } finally {
    await close();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "google catalog failed";
  console.error(redactDatabaseUrl(message));
  process.exit(1);
});
