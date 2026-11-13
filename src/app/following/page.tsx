import type { Metadata } from "next";
import { PlaceholderPage } from "@/components/placeholder-page";

export const metadata: Metadata = {
  title: "Following · PriceTrail",
};

export default function FollowingPage() {
  return (
    <PlaceholderPage
      title="Following"
      sentence="Following is your home page. Models and labs you follow will show up here."
    />
  );
}
