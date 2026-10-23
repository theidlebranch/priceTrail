import { defineConfig } from "drizzle-kit";

/**
 * drizzle-kit loads .env before it imports this file.
 * The app ping script does not import this file, so a missing URL
 * does not break `pnpm test` or `pnpm dev`.
 */
function requireDatabaseUrl(): string {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(
      "DATABASE_URL is missing. drizzle-kit reads it from the environment or from .env.",
    );
  }
  return databaseUrl;
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/server/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: requireDatabaseUrl(),
  },
});
