const LEGEND = [
  {
    label: "Unchanged",
    title: "The download worked and the parsed prices matched the last check.",
    className: "bg-status-ok",
  },
  {
    label: "Changed",
    title: "The download worked and the parsed prices were new. That check stored a snapshot.",
    className: "bg-status-info",
  },
  {
    label: "Parser failed",
    title: "The site answered, and the page could not be read. Nothing was stored.",
    className: "bg-status-warning",
  },
  {
    label: "Download failed",
    title: "The site did not return a page. Nothing was stored.",
    className: "bg-status-error",
  },
  {
    label: "No check",
    title: "This slot has no check. A new source fills in from the right.",
    className: "bg-border",
  },
] as const;

/** Five squares. The long explanation is the title, and the word is always visible. */
export function StripLegend() {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-2">
      {LEGEND.map((item) => (
        <li key={item.label} title={item.title} className="flex items-center gap-1.5 text-muted-foreground">
          <span className={`size-2.5 shrink-0 rounded-sm ${item.className}`} aria-hidden="true" />
          {item.label}
        </li>
      ))}
    </ul>
  );
}
