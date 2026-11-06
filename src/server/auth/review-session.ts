import { reviewSessionFromAuthResult, type ReviewSession } from "@/core/auth/review-access";
import { auth } from "@/server/auth/auth";

/**
 * Read the review cookie.
 *
 * Call this only after AUTH_SECRET is known to be set. Auth.js turns a
 * missing secret into "no session", which would look like a signed-out
 * visitor. The proxy checks the secret first and does not call this.
 */
export async function readReviewSession(): Promise<ReviewSession | null> {
  const session = await auth();
  return reviewSessionFromAuthResult(session);
}
