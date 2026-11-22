import type { LabRequestEntry } from "@/app/labs/lab-request-view";
import Link from "next/link";

/**
 * The suggestions one account has made. A guest does not see rows.
 * An empty list is a signed-in account with no suggestions.
 */
export function ContributionList({
  entries,
  signedIn,
}: {
  entries: readonly LabRequestEntry[];
  signedIn: boolean;
}) {
  return (
    <div>
      <header>
        <h1 className="text-page-title font-semibold tracking-tight">Contributions</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
          Labs you asked PriceTrail to track.
        </p>
      </header>
      {!signedIn ? (
        <p className="mt-8 text-sm leading-6 text-muted-foreground">
          <Link href="/sign-in" className="text-primary">
            Sign in
          </Link>{" "}
          to see your suggestions.
        </p>
      ) : entries.length === 0 ? (
        <p className="mt-8 text-sm text-muted-foreground">You have not suggested a lab.</p>
      ) : (
        <ul className="mt-8 overflow-hidden rounded-xl border border-border">
          {entries.map((entry) => (
            <li key={entry.id} className="border-b border-border px-4 py-4 last:border-b-0">
              <p className="font-medium text-foreground">{entry.labName}</p>
              <p className="mt-1 text-sm text-muted-foreground">{entry.statusLabel}</p>
              <p className="mt-1 font-mono text-meta text-tertiary-foreground">{entry.suggestedAtText}</p>
              {entry.reviewNote === null ? null : (
                <p className="mt-2 text-sm text-foreground">{entry.reviewNote}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
