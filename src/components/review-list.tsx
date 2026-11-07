"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { ReviewListEntry } from "@/app/review/review-list";
import { ReviewPageHeader } from "@/components/review-page-header";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * The waiting list. Prices stay on the detail page. An empty array is a
 * successful read that found nothing waiting.
 * Search and lab chips filter the rows already loaded. They do not ask
 * the database for a new list.
 */
export function ReviewList({ entries }: { entries: readonly ReviewListEntry[] }) {
  const [query, setQuery] = useState("");
  const [lab, setLab] = useState<string | null>(null);
  const visible = visibleEntries(entries, query, lab);

  return (
    <div>
      <ReviewPageHeader count={entries.length} />
      {entries.length === 0 ? (
        <p className="mt-8 text-sm text-muted-foreground">Nothing is waiting for review.</p>
      ) : (
        <>
          <div className="mt-8">
            <Input
              type="search"
              aria-label="Search by model name"
              placeholder="Search by model name"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <LabChips entries={entries} selected={lab} onSelect={setLab} />
          {visible.length === 0 ? (
            <p className="mt-6 text-sm text-muted-foreground">Nothing matches.</p>
          ) : (
            <ul className="mt-6 overflow-hidden rounded-xl border border-border">
              {visible.map((entry) => (
                <li key={entry.href} className="border-b border-border last:border-b-0">
                  <Link
                    href={entry.href}
                    className="flex items-start justify-between gap-4 px-4 py-4 hover:bg-secondary"
                  >
                    <span className="min-w-0">
                      <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                        <span className="font-medium text-foreground">{entry.modelName}</span>
                        <span className="text-muted-foreground">{entry.labName}</span>
                      </span>
                      <span className="mt-1 block font-mono text-meta text-tertiary-foreground">
                        {entry.fetchedAtText}
                      </span>
                      <span className="mt-1 block font-mono text-sm break-all text-muted-foreground">
                        {entry.sourceUrl}
                      </span>
                      {entry.reviewNote === null ? null : (
                        <span className="mt-1 block text-sm text-foreground">{entry.reviewNote}</span>
                      )}
                    </span>
                    <ChevronRight
                      className="mt-0.5 size-4 shrink-0 text-tertiary-foreground"
                      aria-hidden="true"
                    />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

function visibleEntries(
  entries: readonly ReviewListEntry[],
  query: string,
  lab: string | null,
): ReviewListEntry[] {
  const needle = query.trim().toLowerCase();
  return entries.filter((entry) => {
    const nameMatches = needle.length === 0 || entry.modelName.toLowerCase().includes(needle);
    const labMatches = lab === null || entry.labName === lab;
    return nameMatches && labMatches;
  });
}

function labsInOrder(entries: readonly ReviewListEntry[]): { name: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    counts.set(entry.labName, (counts.get(entry.labName) ?? 0) + 1);
  }
  return [...counts.entries()].map(([name, count]) => ({ name, count }));
}

function LabChips({
  entries,
  selected,
  onSelect,
}: {
  entries: readonly ReviewListEntry[];
  selected: string | null;
  onSelect: (lab: string | null) => void;
}) {
  const labs = labsInOrder(entries);

  return (
    <fieldset className="mt-4">
      <legend className="sr-only">Lab</legend>
      <div className="flex flex-wrap gap-2">
        <LabChip
          label="All"
          count={entries.length}
          checked={selected === null}
          onSelect={() => onSelect(null)}
        />
        {labs.map((lab) => (
          <LabChip
            key={lab.name}
            label={lab.name}
            count={lab.count}
            checked={selected === lab.name}
            onSelect={() => onSelect(lab.name)}
          />
        ))}
      </div>
    </fieldset>
  );
}

function LabChip({
  label,
  count,
  checked,
  onSelect,
}: {
  label: string;
  count: number;
  checked: boolean;
  onSelect: () => void;
}) {
  return (
    <label
      className={cn(
        "relative inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1 text-sm",
        checked ? "text-primary" : "text-foreground",
      )}
    >
      <input
        type="radio"
        name="review-lab"
        className="absolute inset-0 cursor-pointer opacity-0"
        checked={checked}
        onChange={onSelect}
        value={label}
        aria-label={`${label} ${count}`}
      />
      {label}
      <span className={cn("tabular-nums", checked ? "text-primary" : "text-tertiary-foreground")}>
        {count}
      </span>
    </label>
  );
}
