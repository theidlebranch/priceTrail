import { createDb } from "@/server/db/client";
import { redactDatabaseUrl } from "@/server/db/seed";
import { parseDatabaseEnv } from "@/server/env";
import {
  verifyOfficialSource,
  type VerifyOfficialResult,
} from "@/server/pipeline/verify-official-source";
import { anthropicSource } from "@/server/sources/anthropic-source";

/**
 * Check the Anthropic pricing page once.
 *
 * This is the edge of the program: it reads the clock and the network.
 * verifyOfficialSource() does the work. A recorded visit, including a
 * failed download or a failed archive, exits 0. A throw exits 1.
 * The message never includes the database URL or the archive keys.
 */
async function main() {
  const { databaseUrl } = parseDatabaseEnv(process.env);
  const { db, close } = createDb(databaseUrl);

  try {
    const result = await verifyOfficialSource(db, {
      source: anthropicSource,
      fetchedAt: new Date(),
      fetchImpl: fetch,
      env: process.env,
      now: () => Date.now(),
      sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    });
    console.log(formatResult(result));
  } finally {
    await close();
  }
}

function formatResult(result: VerifyOfficialResult): string {
  switch (result.kind) {
    case "fetch_error":
      return `fetch_error: ${result.note}`;
    case "parser_suspect":
      return `parser_suspect: ${result.note}`;
    case "unchanged":
      return "unchanged";
    case "changed":
      if (result.archive.kind === "failed") {
        return `changed observation ${result.observationId}: archive failed: ${result.archive.reason}`;
      }
      return `changed observation ${result.observationId}: ${result.archive.permalink}`;
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "verify failed";
  console.error(redactDatabaseUrl(message));
  process.exit(1);
});
