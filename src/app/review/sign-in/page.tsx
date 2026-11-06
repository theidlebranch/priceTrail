import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { buttonVariants } from "@/components/ui/button";
import {
  configuredReviewProviders,
  reviewAuthSecretConfigured,
} from "@/core/auth/review-access";
import { signInReviewer, signOutReviewer } from "@/server/auth/sign-in-reviewer";

export const metadata: Metadata = {
  title: "Review sign-in · PriceTrail",
};

/**
 * This page is not the review queue. The proxy leaves it open so a
 * signed-out visitor is not redirected back here forever.
 *
 * The buttons sit inside Suspense. Reading the environment during
 * prerender would freeze "not configured" into the page even after the
 * secrets are filled in.
 */
export default function ReviewSignInPage() {
  return (
    <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-10">
      <h1 className="text-3xl font-semibold tracking-tight">Review sign-in</h1>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
        Only a listed Google or GitHub account can open the review page.
      </p>
      <div className="mt-8">
        <Suspense fallback={<p className="text-sm text-muted-foreground">Loading sign-in…</p>}>
          <SignInChoices />
        </Suspense>
      </div>
    </section>
  );
}

async function SignInChoices() {
  await connection();
  const secretConfigured = reviewAuthSecretConfigured(process.env);
  const providers = configuredReviewProviders(process.env);
  if (!secretConfigured || providers.length === 0) {
    return <p className="text-sm text-muted-foreground">Review sign-in is not configured.</p>;
  }

  return (
    <div className="flex flex-col items-start gap-3">
      {providers.includes("google") ? (
        <form action={signInReviewer.bind(null, "google")}>
          <button type="submit" className={buttonVariants()}>
            Sign in with Google
          </button>
        </form>
      ) : null}
      {providers.includes("github") ? (
        <form action={signInReviewer.bind(null, "github")}>
          <button type="submit" className={buttonVariants()}>
            Sign in with GitHub
          </button>
        </form>
      ) : null}
      <form action={signOutReviewer}>
        <button type="submit" className={buttonVariants({ variant: "outline" })}>
          Sign out
        </button>
      </form>
    </div>
  );
}
