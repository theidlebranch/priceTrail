import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { toAccountListEntries } from "@/app/review/account-list";
import { requireAllowedReviewer } from "@/app/review/require-reviewer";
import { AccountList, AccountsPageHeader } from "@/components/account-list";
import { createDb } from "@/server/db/client";
import { listAccounts } from "@/server/db/repositories/accounts";
import { parseDatabaseEnv } from "@/server/env";

export const metadata: Metadata = {
  title: "Accounts · PriceTrail",
};

/**
 * People who have signed in. The proxy already locks /review.
 * requireAllowedReviewer() repeats that check. The read is select-only.
 * This page does not call publishPriceVersion().
 */
export default function ReviewAccountsPage() {
  return (
    <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-10">
      <Suspense fallback={<AccountsLoading />}>
        <AccountListLoader />
      </Suspense>
    </section>
  );
}

function AccountsLoading() {
  return (
    <>
      <AccountsPageHeader />
      <p className="mt-8 text-sm text-muted-foreground">Loading accounts…</p>
    </>
  );
}

async function AccountListLoader() {
  await connection();
  await requireAllowedReviewer();
  const { databaseUrl } = parseDatabaseEnv(process.env);
  const { db, close } = createDb(databaseUrl);

  try {
    const rows = await listAccounts(db);
    return <AccountList entries={toAccountListEntries(rows)} />;
  } finally {
    await close();
  }
}
