import type { ArchiveState } from "@/core/source-health";
import type { WaybackView } from "@/app/review/source-health";
import { StatusDot } from "@/components/source-health/status-dot";
import { textToneClass } from "@/components/source-health/tones";

const LABEL = {
  none: "No snapshot",
  archived: "Archived",
  pending: "Pending",
  failed: "Failed, stored copy kept",
} as const;

/**
 * A check with no observation says "No snapshot" in muted text.
 * A changed check names the snapshot and links the permalink when there is one.
 * History puts the anomaly chips under the result, so it can hide them here.
 */
export function WaybackCell({
  wayback,
  showChips = true,
}: {
  wayback: WaybackView;
  showChips?: boolean;
}) {
  if (wayback.kind === "none") {
    return <span className="text-muted-foreground">No snapshot</span>;
  }

  const tone = waybackTone(wayback.kind);

  return (
    <span className={`inline-flex flex-wrap items-center gap-x-1.5 gap-y-1 ${textToneClass(tone)}`}>
      <StatusDot tone={tone} />
      <span>{LABEL[wayback.kind]}</span>
      {wayback.id === null ? null : (
        <>
          {wayback.archiveUrl === null ? (
            <span className="font-mono">#{wayback.id}</span>
          ) : (
            <a
              href={wayback.archiveUrl}
              className="font-mono underline"
              rel="noreferrer"
              target="_blank"
            >
              #{wayback.id}
            </a>
          )}
        </>
      )}
      {showChips
        ? wayback.chips.map((chip) => (
            <span
              key={chip}
              className="inline-block rounded-md border border-border px-1.5 py-0.5 text-status-warning"
            >
              {chip}
            </span>
          ))
        : null}
    </span>
  );
}

function waybackTone(kind: ArchiveState) {
  if (kind === "failed") {
    return "error" as const;
  }
  if (kind === "pending") {
    return "warn" as const;
  }
  return "unchanged" as const;
}
