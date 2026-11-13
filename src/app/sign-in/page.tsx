import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { buttonVariants } from "@/components/ui/button";
import { configuredReviewProviders, reviewAuthSecretConfigured } from "@/core/auth/review-access";
import { readHeaderViewer } from "@/server/auth/header-session";
import { signInAccount, signOutAccount } from "@/server/auth/sign-in-reviewer";

export const metadata: Metadata = {
  title: "Sign in · PriceTrail",
};

/**
 * Sign in and Create account both land here. The first Google or GitHub
 * sign-in is the account. There is no separate password form.
 *
 * The buttons sit inside Suspense. Reading the environment during
 * prerender would freeze "not configured" into the page even after the
 * secrets are filled in.
 */
export default function SignInPage() {
  return (
    <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-10">
      <h1 className="text-page-title font-semibold tracking-tight">Sign in</h1>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
        The first time you sign in with Google or GitHub, that creates your account.
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
  if (!reviewAuthSecretConfigured(process.env)) {
    return <p className="text-sm text-muted-foreground">Sign-in is not configured.</p>;
  }

  const viewer = await readHeaderViewer();
  if (viewer.role !== "guest") {
    return (
      <div className="flex flex-col items-start gap-3">
        <p className="text-sm text-foreground">You are signed in as {viewer.label}.</p>
        <form action={signOutAccount}>
          <button type="submit" className={buttonVariants({ variant: "outline" })}>
            Sign out
          </button>
        </form>
      </div>
    );
  }

  const providers = configuredReviewProviders(process.env);
  if (providers.length === 0) {
    return <p className="text-sm text-muted-foreground">Sign-in is not configured.</p>;
  }

  return (
    <div className="flex flex-col items-start gap-3">
      {providers.includes("google") ? (
        <form action={signInAccount.bind(null, "google")}>
          <button type="submit" className={buttonVariants()}>
            Sign in with Google
          </button>
        </form>
      ) : null}
      {providers.includes("github") ? (
        <form action={signInAccount.bind(null, "github")}>
          <button type="submit" className={buttonVariants()}>
            Sign in with GitHub
          </button>
        </form>
      ) : null}
    </div>
  );
}
