import type { Metadata } from "next";
import { Suspense } from "react";
import { ReviewPlaceholder } from "@/app/review/review-placeholder";

export const metadata: Metadata = {
  title: "Price reports · PriceTrail",
};

export default function PriceReportsPage() {
  return (
    <Suspense fallback={<p className="px-4 py-12 text-sm text-muted-foreground">Loading…</p>}>
      <ReviewPlaceholder
        title="Price reports"
        sentence="Price reports are claims that a published price is wrong."
      />
    </Suspense>
  );
}
