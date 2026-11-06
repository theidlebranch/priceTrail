import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { toReviewDetailView } from "@/app/review/review-detail";
import { parseReviewItemId } from "@/app/review/review-list";
import { requireAllowedReviewer } from "@/app/review/require-reviewer";
import { ReviewDetail } from "@/components/review-detail";
import { createDb } from "@/server/db/client";
import { findReviewItem } from "@/server/db/repositories/review-queue";
import { parseDatabaseEnv } from "@/server/env";

export const metadata: Metadata = {
  title: "Review item · PriceTrail",
};

/**
 * params is a Promise in this Next.js version. It is awaited inside
 * Suspense, not in this component. Reading it here counts as runtime
 * data during prerender, and Next.js blocks the page.
 *
 * The heading comes from the database, so it sits inside Suspense with
 * the loader. There is no "use cache".
 *
 * An id that is not a whole number throws before the database opens.
 * A missing item is an HTTP 404 from src/proxy.ts, before this page
 * renders. If that row is gone by the time this loader reads it, the
 * read failed and this function throws.
 *
 * connection() runs before the database client opens, for the same
 * reason as the review list. This page does not call
 * publishPriceVersion().
 */
export default function ReviewItemPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-10">
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading review item…</p>}>
        <ReviewItemLoader params={params} />
      </Suspense>
    </section>
  );
}

async function ReviewItemLoader({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await connection();
  const itemId = parseReviewItemId(id);
  await requireAllowedReviewer();
  const { databaseUrl } = parseDatabaseEnv(process.env);
  const { db, close } = createDb(databaseUrl);

  try {
    const row = await findReviewItem(db, itemId);
    if (row === null) {
      throw new Error("review item disappeared before the page could read it");
    }
    return <ReviewDetail view={toReviewDetailView(row)} />;
  } finally {
    await close();
  }
}
