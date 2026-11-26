import { asc, desc, type ExtractTablesWithRelations } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import type { PostgresJsDatabase, PostgresJsQueryResultHKT } from "drizzle-orm/postgres-js";
import { accountSignInFromProvider } from "@/core/auth/account-sign-in";
import * as schema from "@/server/db/schema";
import { accounts } from "@/server/db/schema";

/**
 * People who have signed in.
 *
 * recordAccountSignIn inserts the first sign-in and, on a later sign-in,
 * refreshes the name, the email, and last_signed_in_at. registered_at
 * stays. listAccounts only selects, newest registration first.
 * This file does not call publishPriceVersion().
 */

type Schema = typeof schema;

export type AccountDb =
  | PostgresJsDatabase<Schema>
  | PgTransaction<PostgresJsQueryResultHKT, Schema, ExtractTablesWithRelations<Schema>>;

export type StoredAccount = {
  accountId: string;
  displayName: string | null;
  email: string | null;
  registeredAt: Date;
  lastSignedInAt: Date;
};

export async function recordAccountSignIn(
  db: AccountDb,
  input: {
    provider: string;
    providerAccountId: string | null | undefined;
    name?: string | null;
    email?: string | null;
    signedInAt: Date;
  },
): Promise<void> {
  const signIn = accountSignInFromProvider(input);
  await db
    .insert(accounts)
    .values({
      accountId: signIn.accountId,
      displayName: signIn.displayName,
      email: signIn.email,
      registeredAt: signIn.signedInAt,
      lastSignedInAt: signIn.signedInAt,
    })
    .onConflictDoUpdate({
      target: accounts.accountId,
      set: {
        displayName: signIn.displayName,
        email: signIn.email,
        lastSignedInAt: signIn.signedInAt,
      },
    });
}

export async function listAccounts(db: AccountDb): Promise<StoredAccount[]> {
  return db
    .select({
      accountId: accounts.accountId,
      displayName: accounts.displayName,
      email: accounts.email,
      registeredAt: accounts.registeredAt,
      lastSignedInAt: accounts.lastSignedInAt,
    })
    .from(accounts)
    .orderBy(desc(accounts.registeredAt), asc(accounts.accountId));
}
