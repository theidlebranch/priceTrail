import { createDb } from "@/server/db/client";
import { redactSecrets } from "@/server/db/seed";
import { parseDatabaseEnv } from "@/server/env";
import {
  readOfficialModelListKeys,
  readOfficialModelLists,
} from "@/server/pipeline/read-official-model-lists";

/**
 * Read the three official model lists once. The schedule calls the same
 * function. This does not call publishPriceVersion().
 */
async function main() {
  const keys = readOfficialModelListKeys(process.env);
  const secrets = [keys.openai, keys.anthropic, keys.google].filter((key): key is string => key !== null);
  const { databaseUrl } = parseDatabaseEnv(process.env);
  const { db, close } = createDb(databaseUrl);
  try {
    const result = await readOfficialModelLists(db, { fetchedAt: new Date(), fetchImpl: fetch, keys });
    console.log(redactSecrets(JSON.stringify({ signal: "model-lists", ...result }), secrets));
  } finally {
    await close();
  }
}

main().catch((error: unknown) => {
  const keys = readOfficialModelListKeys(process.env);
  const secrets = [keys.openai, keys.anthropic, keys.google].filter((key): key is string => key !== null);
  const message = error instanceof Error ? error.message : "model list read failed";
  console.error(redactSecrets(message, secrets));
  process.exit(1);
});
