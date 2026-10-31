import Link from "next/link";
import type { ModelListEntry } from "@/app/models/model-list-entries";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * The checked list. Prices stay off this page. The detail route owns them.
 * An empty array is a successful read that found no models.
 */
export function ModelList({ entries }: { entries: readonly ModelListEntry[] }) {
  if (entries.length === 0) {
    return <p className="text-sm text-muted-foreground">No models are tracked yet.</p>;
  }

  return (
    <ul className="grid gap-4 sm:grid-cols-2">
      {entries.map((entry) => (
        <li key={entry.href}>
          <Card>
            <CardHeader>
              <CardTitle>
                <Link href={entry.href} className="hover:underline">
                  {entry.modelName}
                </Link>
              </CardTitle>
              <CardDescription>{entry.labName}</CardDescription>
            </CardHeader>
            {entry.retired ? (
              <CardContent>
                <p className="font-mono text-xs uppercase tracking-wide text-muted-foreground">
                  Retired
                </p>
              </CardContent>
            ) : null}
          </Card>
        </li>
      ))}
    </ul>
  );
}
