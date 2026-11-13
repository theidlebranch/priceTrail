import type { Metadata } from "next";
import { Suspense } from "react";
import { ReviewPlaceholder } from "@/app/review/review-placeholder";

export const metadata: Metadata = {
  title: "Requests · PriceTrail",
};

export default function ReviewRequestsPage() {
  return (
    <Suspense fallback={<p className="px-4 py-12 text-sm text-muted-foreground">Loading…</p>}>
      <ReviewPlaceholder
        title="Requests"
        sentence="Requests are source suggestions waiting for a reviewer."
      />
    </Suspense>
  );
}
