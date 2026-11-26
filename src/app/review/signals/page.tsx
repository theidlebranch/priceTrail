import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { toSignalBoardView } from "@/app/review/signals-view";
import { requireAllowedReviewer } from "@/app/review/require-reviewer";
import { SignalJobBoard } from "@/components/signals-board";
import { createDb } from "@/server/db/client";
import { listSignalJobs } from "@/server/db/repositories/litellm-signals";
import { parseDatabaseEnv } from "@/server/env";

export const metadata: Metadata = {
  title: "Signals · PriceTrail",
};

/**
 * LiteLLM, OpenRouter, then the three official model lists. Each row is
 * the last run and the counts from the last good read. The findings
 * themselves are on /review/signals/<id>.
 *
 * The proxy already locks /review. requireAllowedReviewer() repeats that
 * check. connection() runs before the database opens so the page is not
 * prerendered. A missing URL or a failed query throws. An unread witness
 * is still a row.
 *
 * This page does not call publishPriceVersion(). It only reads.
 */
export default function SignalsPage() {
  return (
    <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-10">
      <Suspense fallback={<SignalsLoading />}>
        <SignalsLoader />
      </Suspense>
    </section>
  );
}

function SignalsLoading() {
  return (
    <>
      <h1 className="text-page-title font-semibold tracking-tight">Signals</h1>
      <p className="mt-8 text-muted-foreground">Loading signals…</p>
    </>
  );
}

async function SignalsLoader() {
  await connection();
  await requireAllowedReviewer();
  const { databaseUrl } = parseDatabaseEnv(process.env);
  const { db, close } = createDb(databaseUrl);
  try {
    const jobs = await listSignalJobs(db);
    return <SignalJobBoard view={toSignalBoardView(jobs)} />;
  } finally {
    await close();
  }
}
