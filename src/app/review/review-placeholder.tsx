import { connection } from "next/server";
import { PlaceholderPage } from "@/components/placeholder-page";
import { requireAllowedReviewer } from "@/app/review/require-reviewer";

/**
 * A review page that has no inbox yet. The proxy already locks /review.
 * This check runs again so a skipped proxy cannot render the sentence.
 */
export async function ReviewPlaceholder({
  title,
  sentence,
}: {
  title: string;
  sentence: string;
}) {
  await connection();
  await requireAllowedReviewer();
  return <PlaceholderPage title={title} sentence={sentence} />;
}
