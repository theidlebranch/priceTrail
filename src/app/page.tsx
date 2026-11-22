import { HeroSection } from "@/components/landing-page/hero-section";
import { ProblemStrip } from "@/components/landing-page/problem-strip";
import { ReceiptsSection } from "@/components/landing-page/receipts-section";
import { HowItWorksSection } from "@/components/landing-page/how-it-works-section";
import { ReviewSection } from "@/components/landing-page/review-section";
import { HonestSection } from "@/components/landing-page/honest-section";
import { PositioningCallout } from "@/components/landing-page/positioning-callout";
import { ChangeFeedSection } from "@/components/landing-page/change-feed-section";
import { FinalCtaSection } from "@/components/landing-page/final-cta-section";

export default function HomePage() {
  return (
    <>
      <HeroSection />
      <ProblemStrip />
      <ReceiptsSection />
      <HowItWorksSection />
      <ReviewSection />
      <HonestSection />
      <PositioningCallout />
      <ChangeFeedSection />
      <FinalCtaSection />
    </>
  );
}
