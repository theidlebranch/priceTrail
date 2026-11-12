import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { parseSourceId, toSourceHistoryView } from "@/app/review/source-health";
import { requireAllowedReviewer } from "@/app/review/require-reviewer";
import { SourceHistory } from "@/components/source-history";
import { createDb } from "@/server/db/client";
import { findSource, listSourceChecks } from "@/server/db/repositories/source-health";
import { parseDatabaseEnv } from "@/server/env";

export const metadata: Metadata = {
  title: "Source history · PriceTrail",
};

/**
 * params is a Promise in this Next.js version. It is awaited inside
 * Suspense, not in this component. Reading it here counts as runtime
 * data during prerender, and Next.js blocks the page.
 *
 * The heading comes from the database, so it sits inside Suspense with
 * the loader. There is no "use cache". A new visit should show up on
 * the next open.
 *
 * An id that is not a whole number throws before the database opens.
 * A missing source is an HTTP 404 from src/proxy.ts, before this page
 * renders. If that row is gone by the time this loader reads it, the
 * read failed and this function throws.
 *
 * connection() runs before the database client opens, for the same
 * reason as the source list. This page only reads. It does not call
 * publishPriceVersion().
 */
export default function SourceHistoryPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-10">
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading source history…</p>}>
        <SourceHistoryLoader params={params} />
      </Suspense>
    </section>
  );
}

async function SourceHistoryLoader({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await connection();
  const sourceId = parseSourceId(id);
  await requireAllowedReviewer();
  const { databaseUrl } = parseDatabaseEnv(process.env);
  const { db, close } = createDb(databaseUrl);

  try {
    const source = await findSource(db, sourceId);
    if (source === null) {
      throw new Error("source disappeared before the page could read it");
    }
    const checks = await listSourceChecks(db, sourceId);
    return <SourceHistory view={toSourceHistoryView(source, checks)} />;
  } finally {
    await close();
  }
}
