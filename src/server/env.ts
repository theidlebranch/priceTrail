import { z } from "zod";
import { readPostgresUrl } from "@/server/postgres-url";

/**
 * Runtime check for DATABASE_URL.
 *
 * TypeScript types disappear when the program runs. A missing or wrong
 * URL would otherwise show up later as a confusing driver error, or worse,
 * as a connection to whatever default the driver picked. This throws first.
 * The error text never includes the URL, because the URL contains the password.
 */
const databaseUrlSchema = z.string().trim().min(1).refine(isPostgresUrl);

export function parseDatabaseEnv(env: NodeJS.Dict<string>): {
  databaseUrl: string;
} {
  const parsed = databaseUrlSchema.safeParse(env.DATABASE_URL);
  if (!parsed.success) {
    throw new Error(
      "DATABASE_URL is missing or invalid. It must be a postgres:// or postgresql:// URL with a host.",
    );
  }

  return { databaseUrl: parsed.data };
}

function isPostgresUrl(value: string): boolean {
  if (!value.startsWith("postgres://") && !value.startsWith("postgresql://")) {
    return false;
  }

  try {
    return readPostgresUrl(value).hosts.some((host) => host.length > 0);
  } catch {
    return false;
  }
}
