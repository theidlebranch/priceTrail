import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { parseHistoryCursor, parseSourceId, toSourceDetailView } from "@/app/review/source-health";
import { requireAllowedReviewer } from "@/app/review/require-reviewer";
import { SourceDetail } from "@/components/source-health/source-detail";
import { createDb } from "@/server/db/client";
import {
  findSource,
  listRecentSourceChecks,
  listSourceCheckPage,
  listSourceObservationRefs,
  readSourceHealthStats,
} from "@/server/db/repositories/source-health";
import { parseDatabaseEnv } from "@/server/env";

export const metadata: Metadata = {
  title: "Source history · PriceTrail",
};

/**
 * params and searchParams are Promises in this Next.js version. They are
 * awaited inside Suspense, not in this component. Reading them here counts
 * as runtime data during prerender, and Next.js blocks the page.
 *
 * An id that is not a whole number throws before the database opens.
 * A missing source is an HTTP 404 from src/proxy.ts, before this page
 * renders. If that row is gone by the time this loader reads it, the
 * read failed and this function throws.
 *
 * connection() runs before the database client opens. There is no
 * "use cache". This page only reads. It does not call publishPriceVersion().
 */
export default function SourceHistoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ before?: string | string[]; beforeId?: string | string[] }>;
}) {
  return (
    <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-10">
      <Suspense fallback={<p className="text-muted-foreground">Loading source history…</p>}>
        <SourceHistoryLoader params={params} searchParams={searchParams} />
      </Suspense>
    </section>
  );
}

async function SourceHistoryLoader({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ before?: string | string[]; beforeId?: string | string[] }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const before = Array.isArray(query.before) ? query.before[0] : query.before;
  const beforeId = Array.isArray(query.beforeId) ? query.beforeId[0] : query.beforeId;
  await connection();
  const sourceId = parseSourceId(id);
  const cursor = parseHistoryCursor(before, beforeId);
  await requireAllowedReviewer();
  const { databaseUrl } = parseDatabaseEnv(process.env);
  const { db, close } = createDb(databaseUrl);

  try {
    const source = await findSource(db, sourceId);
    if (source === null) {
      throw new Error("source disappeared before the page could read it");
    }
    const now = new Date();
    const [stats, recent, page, observations] = await Promise.all([
      readSourceHealthStats(db, sourceId),
      listRecentSourceChecks(db, sourceId),
      listSourceCheckPage(db, sourceId, cursor),
      listSourceObservationRefs(db, sourceId),
    ]);
    return (
      <SourceDetail view={toSourceDetailView(source, stats, recent, page, observations, now)} />
    );
  } finally {
    await close();
  }
}
