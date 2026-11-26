import { formatUtcCompact } from "@/core/source-health";
import type { StoredAccount } from "@/server/db/repositories/accounts";

/**
 * The account list the reviewer page draws.
 *
 * A missing name or email becomes a short sentence, so the cell is not
 * blank. Times are the short UTC stamp used on the other review pages.
 */

export type AccountListEntry = {
  accountId: string;
  name: string;
  email: string;
  lastSignedIn: string;
  registered: string;
};

export function toAccountListEntries(rows: readonly StoredAccount[]): AccountListEntry[] {
  return rows.map((row) => ({
    accountId: row.accountId,
    name: row.displayName ?? "No name",
    email: row.email ?? "No email",
    lastSignedIn: utcStamp(row.lastSignedInAt),
    registered: utcStamp(row.registeredAt),
  }));
}

export function accountCountLabel(count: number): string {
  if (!Number.isInteger(count) || count < 0) {
    throw new Error("account count must be a whole number");
  }
  return count === 1 ? "1 account" : `${count} accounts`;
}

function utcStamp(value: Date): string {
  return `${formatUtcCompact(value).short} UTC`;
}
