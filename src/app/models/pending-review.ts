/**
 * Decide whether the public page should say a change is under review.
 *
 * flagged means a person still has to look. ok means the cell check
 * passed, which is not a waiting review. confirmed and rejected are
 * finished. An unknown status throws, so a typo cannot look like
 * "nothing is waiting."
 *
 * This function does not read a price. The banner is only a yes or no.
 */

const REVIEW_STATUSES = ["ok", "flagged", "confirmed", "rejected"] as const;

export function changeUnderReview(statuses: readonly string[]): boolean {
  for (const status of statuses) {
    if (!isReviewStatus(status)) {
      throw new Error(`review status ${status} is not known`);
    }
  }

  return statuses.some((status) => status === "flagged");
}

function isReviewStatus(status: string): boolean {
  return (REVIEW_STATUSES as readonly string[]).includes(status);
}
