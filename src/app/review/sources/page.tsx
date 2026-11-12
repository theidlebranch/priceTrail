import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { parseBoardFilter, toSourceBoardView } from "@/app/review/source-health";
import { requireAllowedReviewer } from "@/app/review/require-reviewer";
import { SourcesBoard } from "@/components/source-health/sources-board";
import { createDb } from "@/server/db/client";
import { listSourceHealth } from "@/server/db/repositories/source-health";
import { parseDatabaseEnv } from "@/server/env";
import { officialSourceUrls } from "@/server/pipeline/scheduled-visit";

export const metadata: Metadata = {
  title: "Sources · PriceTrail",
};

/**
 * The heading is in the Suspense fallback, so it shows before the
 * database returns. searchParams is a Promise in this Next.js version.
 * It is awaited inside Suspense, not in this component.
 *
 * connection() runs before the database client opens. The postgres
 * driver calls Math.random() while it starts, and Next.js refuses to
 * prerender that. There is no "use cache".
 *
 * The proxy already locked this path. requireAllowedReviewer() repeats
 * that check so a skipped proxy cannot show the list. A missing
 * database URL or a failed query throws. The empty sentence is only
 * for a query that returned no sources.
 *
 * This page does not call publishPriceVersion(). It only reads.
 */
export default function SourceHealthPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string | string[] }>;
}) {
  return (
    <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-10">
      <Suspense fallback={<SourceHealthLoading />}>
        <SourceHealthLoader searchParams={searchParams} />
      </Suspense>
    </section>
  );
}

function SourceHealthLoading() {
  return (
    <>
      <h1 className="text-page-title font-semibold tracking-tight">Sources</h1>
      <p className="mt-8 text-muted-foreground">Loading sources…</p>
    </>
  );
}

async function SourceHealthLoader({
  searchParams,
}: {
  searchParams: Promise<{ status?: string | string[] }>;
}) {
  const query = await searchParams;
  const status = Array.isArray(query.status) ? query.status[0] : query.status;
  await connection();
  await requireAllowedReviewer();
  const { databaseUrl } = parseDatabaseEnv(process.env);
  const { db, close } = createDb(databaseUrl);

  try {
    const rows = await listSourceHealth(db);
    const now = new Date();
    return <SourcesBoard view={toSourceBoardView(rows, officialSourceUrls(), parseBoardFilter(status), now)} />;
  } finally {
    await close();
  }
}
