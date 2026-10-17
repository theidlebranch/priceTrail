import { ArrowRight } from "lucide-react"
import { buttonVariants } from "@/components/ui/button"

export function FinalCtaSection() {
  return (
    <section className="bg-card py-16">
      <div className="mx-auto max-w-7xl px-4 text-center sm:px-6 lg:px-10">
        <p className="mb-6 font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Tracking at launch</p>
        <div className="flex flex-wrap items-center justify-center gap-8 border-b border-border pb-12 font-mono text-sm font-semibold tracking-wider text-muted-foreground sm:gap-12 sm:text-base md:gap-16">
          <span>OPENAI</span><span>ANTHROPIC</span><span>GOOGLE</span>
        </div>
        <div className="mx-auto max-w-xl space-y-4 pt-12">
          <h2 className="text-2xl font-semibold tracking-tight">Ready to look at the pricing history?</h2>
          <p className="text-sm leading-6 text-muted-foreground">Browse current prices and how they changed, each with its sources.</p>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <a href="/models" className={buttonVariants({ size: "lg" })}>Browse the pricing history</a>
            <a href="#how-it-works" className={buttonVariants({ variant: "ghost", size: "lg" })}>How verification works <ArrowRight className="ml-1 size-4" /></a>
          </div>
        </div>
      </div>
    </section>
  )
}
