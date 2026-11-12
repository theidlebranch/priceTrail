import { createDb } from "@/server/db/client";
import { clearSamePriceFlags, planSamePriceClears } from "@/server/db/clear-same-price";
import { redactDatabaseUrl } from "@/server/db/seed";
import { parseDatabaseEnv } from "@/server/env";

/**
 * Settle review items whose tracked price did not change.
 *
 * With no flag, this prints the items it would settle and writes nothing.
 * Pass --write to stamp those items confirmed. It does not download a
 * page and does not call publishPriceVersion().
 */
async function main() {
  const write = process.argv.includes("--write");
  const { databaseUrl } = parseDatabaseEnv(process.env);
  const { db, close } = createDb(databaseUrl);

  try {
    const result = write
      ? await db.transaction(async (tx) => clearSamePriceFlags(tx))
      : await planSamePriceClears(db);
    for (const item of result.clear) {
      console.log(`clear ${item.id} ${item.labSlug} ${item.modelSlug}`);
    }
    for (const item of result.keep) {
      console.log(`keep ${item.id} ${item.labSlug} ${item.modelSlug}`);
    }
    if (write) {
      console.log(`cleared ${result.clear.length}`);
    } else {
      console.log("dry run, nothing written");
    }
  } finally {
    await close();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "clear same price failed";
  console.error(redactDatabaseUrl(message));
  process.exit(1);
});