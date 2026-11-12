"use client";

import { useState, type ReactNode } from "react";

/**
 * The only client piece on these pages. The extra rows are already
 * rendered with their times, so opening this cannot change the clock.
 */
export function HistoryShowMore({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  if (open) {
    return children;
  }
  return (
    <button type="button" className="px-4 py-2 text-left text-muted-foreground underline" onClick={() => setOpen(true)}>
      {label}
    </button>
  );
}
