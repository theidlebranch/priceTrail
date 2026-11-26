import { createDb } from "@/server/db/client";
import { recordAccountSignIn } from "@/server/db/repositories/accounts";
import { parseDatabaseEnv } from "@/server/env";

/**
 * Store one completed Google or GitHub sign-in.
 *
 * The caller is the login callback, and only when the provider account
 * is present. A later cookie refresh does not call this. A failed write
 * fails the sign-in, so the account list does not quietly miss a person.
 * This does not call publishPriceVersion().
 */
export async function recordSignIn(input: {
  provider: string;
  providerAccountId: string | null | undefined;
  name?: string | null;
  email?: string | null;
  signedInAt: Date;
}): Promise<void> {
  const { databaseUrl } = parseDatabaseEnv(process.env);
  const { db, close } = createDb(databaseUrl);
  try {
    await recordAccountSignIn(db, input);
  } finally {
    await close();
  }
}
