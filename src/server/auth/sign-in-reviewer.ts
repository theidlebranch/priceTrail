"use server";

import { assertCanStartReviewSignIn } from "@/core/auth/review-access";
import { signIn, signOut } from "@/server/auth/auth";

/**
 * Start Google or GitHub login.
 *
 * The button passes the provider name. We check it again here, because a
 * form post can send any string. A provider that is not configured throws
 * before Auth.js is asked to redirect.
 */
export async function signInReviewer(provider: string): Promise<void> {
  const known = assertCanStartReviewSignIn(provider, process.env);
  await signIn(known, { redirectTo: "/review" });
}

/**
 * The public Sign in and Create account buttons. The first Google or
 * GitHub sign-in is the account. Afterwards the visitor lands on
 * Following, which is the signed-in home. The review button still
 * returns to /review.
 */
export async function signInAccount(provider: string): Promise<void> {
  const known = assertCanStartReviewSignIn(provider, process.env);
  await signIn(known, { redirectTo: "/following" });
}

export async function signOutReviewer(): Promise<void> {
  await signOut({ redirectTo: "/review/sign-in" });
}

export async function signOutAccount(): Promise<void> {
  await signOut({ redirectTo: "/" });
}
