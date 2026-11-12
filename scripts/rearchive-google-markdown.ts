import { rearchiveGoogleMarkdown } from "@/server/archive/rearchive-google";
import { createDb } from "@/server/db/client";
import { redactDatabaseUrl } from "@/server/db/seed";
import { parseDatabaseEnv } from "@/server/env";

/**
 * Save the Google markdown pricing page in the Wayback Machine and point
 * the latest Google snapshot at that link.
 *
 * A failed capture leaves the old link in place. This does not download
 * the page into raw_content, and it does not call publishPriceVersion().
 * A second run does not ask Wayback again once the link already names the
 * markdown page.
 */
async function main() {
  const { databaseUrl } = parseDatabaseEnv(process.env);
  const { db, close } = createDb(databaseUrl);

  try {
    const result = await rearchiveGoogleMarkdown(db, {
      env: process.env,
      fetchImpl: fetch,
      now: () => Date.now(),
      sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    });
    if (result.kind === "failed") {
      console.error(`Google markdown capture failed: ${result.reason}`);
      process.exitCode = 1;
      return;
    }
    console.log(`${result.kind} observation ${result.observationId}`);
    console.log(result.permalink);
  } finally {
    await close();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "google markdown archive failed";
  console.error(redactDatabaseUrl(message));
  process.exit(1);
});
