import Link from "next/link";
import type { ReviewListEntry } from "@/app/review/review-list";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * The waiting list. Prices stay on the detail page. An empty array is a
 * successful read that found nothing waiting.
 */
export function ReviewList({ entries }: { entries: readonly ReviewListEntry[] }) {
  if (entries.length === 0) {
    return <p className="text-sm text-muted-foreground">Nothing is waiting for review.</p>;
  }

  return (
    <ul className="grid gap-4">
      {entries.map((entry) => (
        <li key={entry.href}>
          <Card>
            <CardHeader>
              <CardTitle>
                <Link href={entry.href} className="hover:underline">
                  {entry.modelName}
                </Link>
              </CardTitle>
              <CardDescription>
                {entry.labName} · {entry.fetchedAtText}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm leading-6 text-muted-foreground">
              <p className="break-all">{entry.sourceUrl}</p>
              {entry.reviewNote === null ? null : <p>{entry.reviewNote}</p>}
            </CardContent>
          </Card>
        </li>
      ))}
    </ul>
  );
}
