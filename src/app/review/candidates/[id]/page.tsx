import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import {
  parseOfficialCandidateId,
  toOfficialCandidateDetail,
} from "@/app/review/official-candidate-view";
import { requireAllowedReviewer } from "@/app/review/require-reviewer";
import { OfficialCandidateDetail } from "@/components/official-candidate-detail";
import { createDb } from "@/server/db/client";
import { findOfficialCandidate } from "@/server/db/repositories/official-candidates";
import { parseDatabaseEnv } from "@/server/env";

export const metadata: Metadata = {
  title: "New model · PriceTrail",
};

/**
 * params is a Promise in this Next.js version. It is awaited inside
 * Suspense, not in this component.
 *
 * An id that is not a whole number throws before the database opens.
 * A missing official card is an HTTP 404 from src/proxy.ts, after the
 * reviewer is allowed in. If that row is gone by the time this loader
 * reads it, the read failed and this function throws.
 *
 * reviewedAt is the time of this request, so the prices match the day
 * Add and publish would use. connection() runs before the database opens.
 */
export default function OfficialCandidatePage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-10">
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading new model…</p>}>
        <OfficialCandidateLoader params={params} />
      </Suspense>
    </section>
  );
}

async function OfficialCandidateLoader({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await connection();
  const candidateId = parseOfficialCandidateId(id);
  await requireAllowedReviewer();
  const { databaseUrl } = parseDatabaseEnv(process.env);
  const { db, close } = createDb(databaseUrl);

  try {
    const row = await findOfficialCandidate(db, candidateId);
    if (row === null) {
      throw new Error("official candidate disappeared before the page could read it");
    }
    return <OfficialCandidateDetail view={toOfficialCandidateDetail(row, new Date())} />;
  } finally {
    await close();
  }
}
