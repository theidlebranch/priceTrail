import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { requireAllowedReviewer } from "@/app/review/require-reviewer";
import { toReviewListEntries } from "@/app/review/review-list";
import { ReviewList } from "@/components/review-list";
import { createDb } from "@/server/db/client";
import { listFlaggedReviewItems } from "@/server/db/repositories/review-queue";
import { parseDatabaseEnv } from "@/server/env";

export const metadata: Metadata = {
  title: "Review · PriceTrail",
};

/**
 * The heading is the static shell. The list sits in Suspense so this
 * Next.js version can render it on the request, not at build time.
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
      <h1 className="text-3xl font-semibold tracking-tight">Review</h1>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
        Official snapshots that are still waiting. A flagged row is not a published price.
      </p>
      <p className="mt-3">
        <Link href="/review/sources" className="text-sm text-foreground underline">
          Source health
        </Link>
      </p>
      <div className="mt-8">
        <Suspense fallback={<p className="text-sm text-muted-foreground">Loading review…</p>}>
          <ReviewListLoader />
        </Suspense>
      </div>
    </section>
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
