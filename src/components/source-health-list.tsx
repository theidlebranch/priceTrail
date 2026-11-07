import type { SourceHealthView } from "@/app/review/source-health";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * The source list. An empty entries array is a successful read that
 * found no source rows. Missing checker warnings stay visible either way.
 */
export function SourceHealthList({ view }: { view: SourceHealthView }) {
  return (
    <div className="grid gap-4">
      {view.missingCheckerWarnings.length === 0 ? null : (
        <ul className="grid gap-2">
          {view.missingCheckerWarnings.map((warning) => (
            <li key={warning} className="text-sm leading-6 text-foreground">
              {warning}
            </li>
          ))}
        </ul>
      )}
      {view.entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">No sources are tracked yet.</p>
      ) : (
        <ul className="grid gap-4">
          {view.entries.map((entry) => (
            <li key={entry.url}>
              <Card>
                <CardHeader>
                  <CardTitle className="break-all text-base">{entry.url}</CardTitle>
                  <CardDescription>
                    {entry.typeText} · {entry.activeText}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2 text-sm leading-6 text-muted-foreground">
                  {entry.outcomeText === null ? (
                    <p>{entry.lastCheckedText}</p>
                  ) : (
                    <>
                      <p>Last checked {entry.lastCheckedText}.</p>
                      <p>
                        {entry.outcomeText}. {entry.checkedAtText}.{" "}
                        {entry.httpStatusText === "no HTTP status"
                          ? "No HTTP status."
                          : `HTTP status: ${entry.httpStatusText}.`}
                      </p>
                      {entry.note === null ? null : <p>Note: {entry.note}</p>}
                    </>
                  )}
                  <p>{entry.archiveText}</p>
                  {entry.warning === null ? null : (
                    <p className="text-foreground">{entry.warning}</p>
                  )}
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
