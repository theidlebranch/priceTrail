import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { toModelListEntries } from "@/app/models/model-list-entries";
import { ModelList } from "@/components/model-list";
import { ModelsPageHeader } from "@/components/models-page-header";
import { createDb } from "@/server/db/client";
import { createCatalogRepository } from "@/server/db/repositories/catalog";
import { parseDatabaseEnv } from "@/server/env";

export const metadata: Metadata = {
  title: "Tracked models · PriceTrail",
};

/**
 * The heading is in the Suspense fallback, so it shows before the
 * database returns. The loaded list repeats that heading and adds the
 * row count. The list sits in Suspense so this Next.js version can
 * render it on the request, not at build time.
 * There is no "use cache": a model added by the seed should show up
 * on the next visit.
 *
 * connection() runs before the database client opens. The postgres
 * driver calls Math.random() while it starts, and Next.js refuses to
 * prerender that. Waiting for a real request keeps the random value
 * out of the static shell.
 *
 * A missing database URL, a failed query, or a bad slug throws.
 * That is not an empty catalog. The empty sentence is only for a
 * query that returned no rows.
 */
export default function ModelsPage() {
  return (
    <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-10">
      <Suspense fallback={<ModelsLoading />}>
        <ModelListLoader />
      </Suspense>
    </section>
  );
}

function ModelsLoading() {
  return (
    <>
      <ModelsPageHeader />
      <p className="mt-8 text-sm text-muted-foreground">Loading models…</p>
    </>
  );
}

async function ModelListLoader() {
  await connection();
  const { databaseUrl } = parseDatabaseEnv(process.env);
  const { db, close } = createDb(databaseUrl);

  try {
    const rows = await createCatalogRepository(db).listModels();
    return <ModelList entries={toModelListEntries(rows)} />;
  } finally {
    await close();
  }
}
