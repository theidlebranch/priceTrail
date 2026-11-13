import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { rejectCandidateAction } from "@/app/review/reject-candidate-action";
import { toSignalsView } from "@/app/review/signals-view";
import { requireAllowedReviewer } from "@/app/review/require-reviewer";
import { SignalsBoard } from "@/components/signals-board";
import { createDb } from "@/server/db/client";
import { findLiteLLMSignalPage } from "@/server/db/repositories/litellm-signals";
import { parseDatabaseEnv } from "@/server/env";

export const metadata: Metadata = {
  title: "Signals · PriceTrail",
};

/**
 * The LiteLLM witness page. The proxy already locks /review.
 * requireAllowedReviewer() repeats that check. connection() runs
 * before the database opens so the page is not prerendered.
 *
 * This page does not call publishPriceVersion().
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
    const page = await findLiteLLMSignalPage(db);
    return <SignalsBoard view={toSignalsView(page)} rejectAction={rejectCandidateAction} />;
  } finally {
    await close();
  }
}
