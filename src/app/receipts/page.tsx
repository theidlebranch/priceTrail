import type { Metadata } from "next";
import { PlaceholderPage } from "@/components/placeholder-page";

export const metadata: Metadata = {
  title: "Receipts · PriceTrail",
};

export default function ReceiptsPage() {
  return (
    <PlaceholderPage
      title="Receipts"
      sentence="Receipts are the public list of price changes, with the proof for each one."
    />
  );
}
