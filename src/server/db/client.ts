import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/server/db/schema";

/**
 * Settings for one short-lived script connection.
 *
 * max: 1 means one connection, not a pool. A ping script does not need more,
 * and a hosted database has a small connection limit.
 * ssl is set only when the URL asks for it. Hosted Postgres (Neon) rejects
 * a connection that is not encrypted. A local database usually does not
 * send sslmode=require, so we leave SSL off in that case.
 */
export function connectionOptions(databaseUrl: string): {
  max: number;
  ssl?: "require";
} {
  const sslmode = new URL(databaseUrl).searchParams.get("sslmode");

  return {
    max: 1,
    ...(sslmode === "require" ? { ssl: "require" as const } : {}),
  };
}

/**
 * Open a Drizzle client. Calling this does not connect yet: postgres.js
 * connects on the first query. Do not call this at import time. Tests and
 * `next build` import modules without a database available.
 */
export function createDb(databaseUrl: string) {
  const client = postgres(databaseUrl, connectionOptions(databaseUrl));
  const db = drizzle(client, { schema });

  return {
    db,
    close: () => client.end({ timeout: 5 }),
  };
}
