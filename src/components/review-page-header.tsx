import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

/**
 * The review page heading. The loading fallback and the loaded list both
 * use it, so the title, description, and Source health link cannot drift
 * apart. The count is the number of rows already loaded. It is omitted
 * while that number is still unknown.
 */
export function ReviewPageHeader({ count }: { count?: number }) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
      <div className="min-w-48 flex-1">
        <h1 className="text-page-title font-semibold tracking-tight">Review</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
          Official snapshots that are still waiting. A flagged row is not a published price.
        </p>
        {count !== undefined ? (
          <p className="mt-3 text-meta text-tertiary-foreground tabular-nums">
            {waitingCountLabel(count)}
          </p>
        ) : null}
      </div>
      <Link href="/review/sources" className={buttonVariants({ variant: "outline" })}>
        Source health
      </Link>
    </header>
  );
}

function waitingCountLabel(count: number): string {
  return count === 1 ? "1 waiting" : `${count} waiting`;
}
