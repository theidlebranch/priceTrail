import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { requireAllowedReviewer } from "@/app/review/require-reviewer";
import { toSourceHealthView } from "@/app/review/source-health";
import { SourceHealthList } from "@/components/source-health-list";
import { SourceHealthPageHeader } from "@/components/source-health-page-header";
import { createDb } from "@/server/db/client";
import { listSourceHealth } from "@/server/db/repositories/source-health";
import { parseDatabaseEnv } from "@/server/env";
import { officialSourceUrls } from "@/server/pipeline/scheduled-visit";

export const metadata: Metadata = {
  title: "Source health · PriceTrail",
};

/**
 * The heading is in the Suspense fallback, so it shows before the
 * database returns. The loaded list repeats that heading and adds the
 * counts. The list sits in Suspense so this Next.js version can render
 * it on the request, not at build time.
 * There is no "use cache": a new check should show up on the next visit.
 *
 * connection() runs before the database client opens. The postgres
 * driver calls Math.random() while it starts, and Next.js refuses to
 * prerender that.
 *
 * The proxy already locked this path. requireAllowedReviewer() repeats
 * that check so a skipped proxy cannot show the list. A missing
 * database URL or a failed query throws. The empty sentence is only
 * for a query that returned no sources.
 *
 * This page does not call publishPriceVersion(). It only reads.
 */
export default function SourceHealthPage() {
  return (
    <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-10">
      <Suspense fallback={<SourceHealthLoading />}>
        <SourceHealthLoader />
      </Suspense>
    </section>
  );
}

function SourceHealthLoading() {
  return (
    <>
      <SourceHealthPageHeader />
      <p className="mt-8 text-sm text-muted-foreground">Loading sources…</p>
    </>
  );
}

async function SourceHealthLoader() {
  await connection();
  await requireAllowedReviewer();
  const { databaseUrl } = parseDatabaseEnv(process.env);
  const { db, close } = createDb(databaseUrl);

  try {
    const rows = await listSourceHealth(db);
    return <SourceHealthList view={toSourceHealthView(rows, officialSourceUrls())} />;
  } finally {
    await close();
  }
}
