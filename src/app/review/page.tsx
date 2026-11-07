import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { requireAllowedReviewer } from "@/app/review/require-reviewer";
import { toReviewListEntries } from "@/app/review/review-list";
import { ReviewList } from "@/components/review-list";
import { ReviewPageHeader } from "@/components/review-page-header";
import { createDb } from "@/server/db/client";
import { listFlaggedReviewItems } from "@/server/db/repositories/review-queue";
import { parseDatabaseEnv } from "@/server/env";

export const metadata: Metadata = {
  title: "Review · PriceTrail",
};

/**
 * The heading is in the Suspense fallback, so it shows before the
 * database returns. The loaded list repeats that heading and adds the
 * row count. The list sits in Suspense so this Next.js version can
 * render it on the request, not at build time.
 * There is no "use cache": a new flagged item should show up on the
 * next visit.
 *
 * connection() runs before the database client opens. The postgres
 * driver calls Math.random() while it starts, and Next.js refuses to
 * prerender that.
 *
 * The proxy already locked this path. requireAllowedReviewer() repeats
 * that check so a skipped proxy cannot show the queue. A missing
 * database URL or a failed query throws. The empty sentence is only
 * for a query that returned no waiting items.
 *
 * This page does not call publishPriceVersion(). Confirm and reject
 * are on the detail page.
 */
export default function ReviewPage() {
  return (
    <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-10">
      <Suspense fallback={<ReviewLoading />}>
        <ReviewListLoader />
      </Suspense>
    </section>
  );
}

function ReviewLoading() {
  return (
    <>
      <ReviewPageHeader />
      <p className="mt-8 text-sm text-muted-foreground">Loading review…</p>
    </>
  );
}

async function ReviewListLoader() {
  await connection();
  await requireAllowedReviewer();
  const { databaseUrl } = parseDatabaseEnv(process.env);
  const { db, close } = createDb(databaseUrl);

  try {
    const rows = await listFlaggedReviewItems(db);
    return <ReviewList entries={toReviewListEntries(rows)} />;
  } finally {
    await close();
  }
}
