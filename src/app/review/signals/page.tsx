import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { rejectCandidateAction } from "@/app/review/reject-candidate-action";
import { OPENROUTER_COPY, toSignalsView } from "@/app/review/signals-view";
import { requireAllowedReviewer } from "@/app/review/require-reviewer";
import { SignalsBoard } from "@/components/signals-board";
import { createDb } from "@/server/db/client";
import { findLiteLLMSignalPage, findOpenRouterSignalPage } from "@/server/db/repositories/litellm-signals";
import { parseDatabaseEnv } from "@/server/env";

export const metadata: Metadata = {
  title: "Signals · PriceTrail",
};

/**
 * The witness page. LiteLLM and OpenRouter are two sections.
 * The signal-health board is a later step. The proxy already locks
 * /review. requireAllowedReviewer() repeats that check. connection()
 * runs before the database opens so the page is not prerendered.
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
    const litellm = await findLiteLLMSignalPage(db);
    const openrouter = await findOpenRouterSignalPage(db);
    return (
      <>
        <h1 className="text-page-title font-semibold tracking-tight">Signals</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
          A witness is another site&apos;s price list. It can disagree with this site, and it can name a
          model we do not track. It cannot publish a price.
        </p>
        <div className="mt-12 space-y-16">
          <SignalsBoard view={toSignalsView(litellm)} rejectAction={rejectCandidateAction} />
          <SignalsBoard
            view={toSignalsView(openrouter, OPENROUTER_COPY)}
            rejectAction={rejectCandidateAction}
          />
        </div>
      </>
    );
  } finally {
    await close();
  }
}
