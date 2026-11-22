import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { toLabListEntries } from "@/app/labs/lab-list";
import { suggestLabAction } from "@/app/labs/suggest-lab-action";
import { LabList } from "@/components/lab-list";
import { LabsPageHeader } from "@/components/labs-page-header";
import { readSignedInAccountId } from "@/server/auth/signed-in-account";
import { createDb } from "@/server/db/client";
import { listLabs } from "@/server/db/repositories/lab-requests";
import { parseDatabaseEnv } from "@/server/env";

export const metadata: Metadata = {
  title: "Labs · PriceTrail",
};

/**
 * The heading is in the Suspense fallback, so it shows before the
 * database returns. The loaded list repeats that heading and adds the
 * row count. The list sits in Suspense so this Next.js version can
 * render it on the request, not at build time.
 *
 * connection() runs before the database client opens. The postgres
 * driver calls Math.random() while it starts, and Next.js refuses to
 * prerender that.
 *
 * A missing database URL or a failed query throws. The empty sentence
 * is only for a query that returned no labs. Suggesting a lab does not
 * call publishPriceVersion().
 */
export default function LabsPage() {
  return (
    <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-10">
      <Suspense fallback={<LabsLoading />}>
        <LabListLoader />
      </Suspense>
    </section>
  );
}

function LabsLoading() {
  return (
    <>
      <LabsPageHeader />
      <p className="mt-8 text-sm text-muted-foreground">Loading labs…</p>
    </>
  );
}

async function LabListLoader() {
  await connection();
  const accountId = await readSignedInAccountId();
  const { databaseUrl } = parseDatabaseEnv(process.env);
  const { db, close } = createDb(databaseUrl);

  try {
    const rows = await listLabs(db);
    return (
      <LabList entries={toLabListEntries(rows)} signedIn={accountId !== null} action={suggestLabAction} />
    );
  } finally {
    await close();
  }
}
