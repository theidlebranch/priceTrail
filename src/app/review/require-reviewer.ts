import {
  parseReviewerAllowlist,
  reviewAuthSecretConfigured,
  reviewLock,
  reviewerId,
} from "@/core/auth/review-access";
import { readReviewSession } from "@/server/auth/review-session";

/**
 * The proxy already decided who may open /review. This check runs again
 * on the page so a skipped proxy cannot render the queue.
 *
 * The path passed here is /review for every review page. The lock only
 * cares that the path is a locked review path, and that the session is
 * on the allowlist. The returned id is the stamp stored in reviewed_by.
 */
export async function requireAllowedReviewer(): Promise<string> {
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
  return reviewerId(session.provider, session.accountId);
}
