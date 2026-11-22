import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { toLabRequestEntries } from "@/app/labs/lab-request-view";
import { ContributionList } from "@/components/contribution-list";
import { readSignedInAccountId } from "@/server/auth/signed-in-account";
import { createDb } from "@/server/db/client";
import { listLabRequestsForAccount } from "@/server/db/repositories/lab-requests";
import { parseDatabaseEnv } from "@/server/env";

export const metadata: Metadata = {
  title: "Contributions · PriceTrail",
};

/**
 * Suggestions from the signed-in account. A guest sees a sign-in line
 * and no rows. This page only selects. It does not call
 * publishPriceVersion().
 */
export default function ContributionsPage() {
  return (
    <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-10">
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading contributions…</p>}>
        <ContributionLoader />
      </Suspense>
    </section>
  );
}

async function ContributionLoader() {
  await connection();
  const accountId = await readSignedInAccountId();
  if (accountId == null) {
    return <ContributionList entries={[]} signedIn={false} />;
  }

  const { databaseUrl } = parseDatabaseEnv(process.env);
  const { db, close } = createDb(databaseUrl);
  try {
    const rows = await listLabRequestsForAccount(db, accountId);
    return <ContributionList entries={toLabRequestEntries(rows)} signedIn />;
  } finally {
    await close();
  }
}
