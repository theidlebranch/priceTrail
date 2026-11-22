import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { parseHistoryCursor, parseSourceId } from "@/app/review/source-health";
import { toSignalHistory, toSignalsView, witnessCopyForUrl } from "@/app/review/signals-view";
import { requireAllowedReviewer } from "@/app/review/require-reviewer";
import { decideCandidateAction } from "@/app/review/decide-candidate-action";
import { SignalDetail } from "@/components/signal-detail";
import { createDb } from "@/server/db/client";
import {
  findLiteLLMSignalPage,
  findOpenRouterSignalPage,
  findSignalSource,
  listWitnessReadPage,
} from "@/server/db/repositories/litellm-signals";
import type { SignalDb } from "@/server/pipeline/read-litellm-signal";
import { parseDatabaseEnv } from "@/server/env";
import { LITELLM_COST_MAP_URL } from "@/server/sources/litellm-signal";
import { OPENROUTER_MODELS_URL } from "@/server/sources/openrouter-signal";

export const metadata: Metadata = {
  title: "Signal history · PriceTrail",
};

/**
 * params and searchParams are Promises in this Next.js version. They are
 * awaited inside Suspense, not in this component.
 *
 * An id that is not a whole number throws before the database opens.
 * A missing signal is an HTTP 404 from src/proxy.ts, after the reviewer
 * is allowed in. If that row is gone by the time this loader reads it,
 * the read failed and this function throws.
 *
 * connection() runs before the database client opens. There is no
 * "use cache". This page only reads. It does not call publishPriceVersion().
 */
export default function SignalHistoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ before?: string | string[]; beforeId?: string | string[] }>;
}) {
  return (
    <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-10">
      <Suspense fallback={<p className="text-muted-foreground">Loading signal history…</p>}>
        <SignalHistoryLoader params={params} searchParams={searchParams} />
      </Suspense>
    </section>
  );
}

async function SignalHistoryLoader({
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
    const source = await findSignalSource(db, sourceId);
    if (source === null) {
      throw new Error("signal disappeared before the page could read it");
    }
    const [findings, history] = await Promise.all([
      findingsFor(db, source.url),
      listWitnessReadPage(db, source.id, cursor),
    ]);
    return (
      <SignalDetail
        findings={toSignalsView(findings, witnessCopyForUrl(source.url))}
        history={toSignalHistory(history, source.id, cursor)}
        action={decideCandidateAction}
      />
    );
  } finally {
    await close();
  }
}

function findingsFor(db: SignalDb, url: string) {
  if (url === LITELLM_COST_MAP_URL) {
    return findLiteLLMSignalPage(db);
  }
  if (url === OPENROUTER_MODELS_URL) {
    return findOpenRouterSignalPage(db);
  }
  throw new Error("signal url is not a witness this page reads");
}
