import { sql } from "drizzle-orm";
import { createDb } from "@/server/db/client";
import { assertSelectOne } from "@/server/db/ping";
import { parseDatabaseEnv } from "@/server/env";

/**
 * Prove the app can reach Postgres.
 * This does not create tables and it does not write prices.
 */
async function main() {
  const { databaseUrl } = parseDatabaseEnv(process.env);
  const { db, close } = createDb(databaseUrl);

  try {
    const rows = await db.execute(sql`select 1 as ok`);
    console.log(assertSelectOne(rows));
  } finally {
    await close();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "database ping failed";
  console.error(message.replace(/postgres(?:ql)?:\/\/\S+/gi, "postgresql://[redacted]"));
  process.exit(1);
});
