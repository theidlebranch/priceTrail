import type { Metadata } from "next";
import { PlaceholderPage } from "@/components/placeholder-page";

export const metadata: Metadata = {
  title: "Account · PriceTrail",
};

export default function AccountPage() {
  return (
    <PlaceholderPage title="Account settings" sentence="Account settings will live here." />
  );
}
