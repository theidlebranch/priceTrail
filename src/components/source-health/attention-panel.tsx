import type { SourceDetailView } from "@/app/review/source-health";

/** The short reason is the title. The sentences explain it. The raw note stays in a box. */
export function AttentionPanel({
  attention,
}: {
  attention: SourceDetailView["attention"];
}) {
  if (attention === null) {
    return null;
  }
  return (
    <section className="mt-6 rounded-xl border border-status-warning bg-status-warning/10 p-4">
      <h2 className="font-medium text-status-warning">{attention.title}</h2>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-foreground">{attention.body}</p>
      {attention.note === null ? null : (
        <pre className="mt-3 overflow-x-auto rounded-md border border-border bg-background p-3 font-mono text-sm whitespace-pre-wrap text-foreground">
          {attention.note}
        </pre>
      )}
    </section>
  );
}
