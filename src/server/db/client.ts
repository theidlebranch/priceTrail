import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/server/db/schema";
import { readPostgresUrl } from "@/server/postgres-url";

/**
 * Settings for one short-lived script connection.
 *
 * max: 1 means one connection, not a pool. A ping script does not need more,
 * and a hosted database has a small connection limit.
 *
 * When TLS is on, ssl is an object with certificate checks enabled.
 * Postgres.js treats the string "require" as "encrypt, but skip the
 * certificate check", so that string is not used here.
 *
 * sslmode=require always turns the check on. If sslmode is missing, a
 * remote host gets the same check, and a local host does not. Local means
 * an empty host, localhost, 127.0.0.1, or ::1. Any other sslmode is left
 * for Postgres.js to read from the URL.
 */
const verifiedTls = { rejectUnauthorized: true } as const;

export function connectionOptions(databaseUrl: string): {
  max: number;
  ssl?: { rejectUnauthorized: true };
} {
  const { hosts, sslmode } = readPostgresUrl(databaseUrl);
  const remote = hosts.some((host) => !isLocalHost(host));

  if (sslmode === "require" || (sslmode === null && remote)) {
    return { max: 1, ssl: verifiedTls };
  }

  return { max: 1 };
}

function isLocalHost(host: string): boolean {
  const name = host.startsWith("[") && host.endsWith("]") ? host.slice(1, -1) : host;

  return (
    name.length === 0 ||
    name.toLowerCase() === "localhost" ||
    name === "127.0.0.1" ||
    name === "::1"
  );
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
