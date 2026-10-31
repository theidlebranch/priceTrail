import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { toModelDetailView } from "@/app/models/model-detail-view";
import { assertPublicSlug } from "@/app/models/model-list-entries";
import { ModelDetail } from "@/components/model-detail";
import { createDb } from "@/server/db/client";
import { findModelDetail } from "@/server/db/repositories/model-detail";
import { parseDatabaseEnv } from "@/server/env";

export const metadata: Metadata = {
  title: "Model · PriceTrail",
};

/**
 * params is a Promise in this Next.js version. It is awaited inside
 * Suspense, not in this component. Reading it here counts as runtime
 * data during prerender, and Next.js blocks the page.
 *
 * The heading comes from the database, so it sits inside Suspense with
 * the loader. There is no "use cache": a newly published price should
 * show up on the next visit.
 *
 * A slug that is empty, contains a slash, or is "." or ".." throws
 * before the database opens. That is bad data, not a missing model.
 * An unknown lab or model is a 404. A failed query, or two current
 * prices, still throws. The empty sentence is only for a model that
 * exists and has no open price.
 *
 * connection() runs before the database client opens, for the same
 * reason as the model list: the postgres driver calls Math.random()
 * while it starts, and Next.js refuses to prerender that.
 */
export default function ModelDetailPage({
  params,
}: {
  params: Promise<{ labSlug: string; modelSlug: string }>;
}) {
  return (
    <section className="border-b border-border bg-card">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-10 lg:py-16">
        <Suspense fallback={<p className="text-sm text-muted-foreground">Loading model…</p>}>
          <ModelDetailLoader params={params} />
        </Suspense>
      </div>
    </section>
  );
}

async function ModelDetailLoader({
  params,
}: {
  params: Promise<{ labSlug: string; modelSlug: string }>;
}) {
  const { labSlug, modelSlug } = await params;
  await connection();
  assertPublicSlug(labSlug, "lab");
  assertPublicSlug(modelSlug, "model");
  const { databaseUrl } = parseDatabaseEnv(process.env);
  const { db, close } = createDb(databaseUrl);

  try {
    const row = await findModelDetail(db, labSlug, modelSlug);
    if (row === null) {
      notFound();
    }
    return <ModelDetail view={toModelDetailView(row)} />;
  } finally {
    await close();
  }
}
