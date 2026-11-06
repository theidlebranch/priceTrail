import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import {
  parseReviewerAllowlist,
  reviewAuthSecretConfigured,
  reviewLock,
  reviewPlaceholder,
} from "@/core/auth/review-access";
import { readReviewSession } from "@/server/auth/review-session";

export const metadata: Metadata = {
  title: "Review · PriceTrail",
};

/**
 * The proxy decides who reaches this page. A signed-out visitor is
 * redirected, and everyone else who is not listed gets a 403, before
 * this shell is sent.
 *
 * The sentence is still checked here. If the proxy was skipped, this
 * throws instead of showing the placeholder. The queue itself is step 30.
 * connection() keeps the cookie read off the prerender.
 */
export default function ReviewPage() {
  return (
    <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-10">
      <h1 className="text-3xl font-semibold tracking-tight">Review</h1>
      <div className="mt-8">
        <Suspense fallback={<p className="text-sm text-muted-foreground">Loading review…</p>}>
          <ReviewPlaceholder />
        </Suspense>
      </div>
    </section>
  );
}

async function ReviewPlaceholder() {
  await connection();
  const secretConfigured = reviewAuthSecretConfigured(process.env);
  const session = secretConfigured ? await readReviewSession() : null;
  const lock = reviewLock({
    pathname: "/review",
    secretConfigured,
    session,
    allowlist: parseReviewerAllowlist(process.env.REVIEWER_ALLOWLIST),
  });
  if (lock !== "allowed" || session == null) {
    throw new Error("Review page was reached without an allowed reviewer.");
  }

  return <p className="text-sm leading-6 text-muted-foreground">{reviewPlaceholder(session)}</p>;
}
