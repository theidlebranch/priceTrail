import { Clock3, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { PricePreviewCard } from "@/components/landing-page/price-preview-card";

export function HeroSection() {
  return (
    <section className="border-b border-border bg-card">
      <div className="mx-auto grid max-w-7xl grid-cols-1 items-start gap-10 px-4 py-12 sm:px-6 lg:grid-cols-12 lg:gap-12 lg:px-10 lg:py-16">
        <div className="flex flex-col justify-center lg:col-span-7">
          <div className="mb-4 inline-flex items-center gap-2">
            <span className="size-2 rounded-full bg-primary" />
            <span className="rounded border border-border bg-muted px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              Independent historical record
            </span>
          </div>
          <h1 className="mb-4 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl lg:text-[44px] lg:leading-[1.18]">
            AI model pricing, with receipts.
          </h1>
          <p className="mb-8 max-w-xl text-base leading-7 text-muted-foreground">
            An independently maintained historical record of AI API prices,
            backed by provider sources and archived evidence.
          </p>
          <div className="mb-8 flex flex-wrap items-center gap-3">
            <Link href="/models" className={buttonVariants({ size: "lg" })}>
              Browse models
            </Link>
            <a
              href="#how-it-works"
              className={buttonVariants({ variant: "outline", size: "lg" })}
            >
              How it works
            </a>
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-3 border-t border-border pt-5 font-mono text-xs leading-5 text-muted-foreground">
            <div className="flex items-center gap-2">
              <ShieldCheck className="size-4 text-primary" />
              <span>SHA-256 hash stored with every source copy</span>
            </div>
            <div className="flex items-center gap-2">
              <Clock3 className="size-4" />
              <span>Official pages checked about every 6 hours</span>
            </div>
          </div>
        </div>
        <div className="w-full lg:col-span-5">
          <PricePreviewCard />
        </div>
      </div>
    </section>
  );
}
