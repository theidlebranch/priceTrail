import type { Metadata } from "next";
import { PlaceholderPage } from "@/components/placeholder-page";

export const metadata: Metadata = {
  title: "Contributions · PriceTrail",
};

export default function ContributionsPage() {
  return (
    <PlaceholderPage
      title="Contributions"
      sentence="Contributions are price reports and source suggestions from your account."
    />
  );
}
