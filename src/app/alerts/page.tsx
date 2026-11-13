import type { Metadata } from "next";
import { PlaceholderPage } from "@/components/placeholder-page";

export const metadata: Metadata = {
  title: "Alerts · PriceTrail",
};

export default function AlertsPage() {
  return (
    <PlaceholderPage
      title="Alerts"
      sentence="Alerts will tell you about a price change by email, Slack, or Discord."
    />
  );
}
