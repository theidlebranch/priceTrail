import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { toLabRequestEntries } from "@/app/labs/lab-request-view";
import { decideLabRequestAction } from "@/app/review/decide-lab-request-action";
import { requireAllowedReviewer } from "@/app/review/require-reviewer";
import { LabRequestList, RequestsPageHeader } from "@/components/lab-request-list";
import { createDb } from "@/server/db/client";
import { listPendingLabRequests } from "@/server/db/repositories/lab-requests";
import { parseDatabaseEnv } from "@/server/env";

export const metadata: Metadata = {
  title: "Requests · PriceTrail",
};

/**
 * Pending lab suggestions. The proxy already locks /review.
 * requireAllowedReviewer() repeats that check. The reads are select-only
 * until Accept or Decline. Accepting does not insert a lab and does not
 * call publishPriceVersion().
 */
export default function ReviewRequestsPage() {
  return (
    <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-10">
      <Suspense fallback={<RequestsLoading />}>
        <RequestListLoader />
      </Suspense>
    </section>
  );
}

function RequestsLoading() {
  return (
    <>
      <RequestsPageHeader />
      <p className="mt-8 text-sm text-muted-foreground">Loading requests…</p>
    </>
  );
}

async function RequestListLoader() {
  await connection();
  await requireAllowedReviewer();
  const { databaseUrl } = parseDatabaseEnv(process.env);
  const { db, close } = createDb(databaseUrl);

  try {
    const rows = await listPendingLabRequests(db);
    return <LabRequestList entries={toLabRequestEntries(rows)} action={decideLabRequestAction} />;
  } finally {
    await close();
  }
}
