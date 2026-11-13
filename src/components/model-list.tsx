"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { ModelListEntry } from "@/app/models/model-list-entries";
import { ModelsPageHeader } from "@/components/models-page-header";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * The checked list. Prices stay off this page. The detail route owns them.
 * An empty array is a successful read that found no models.
 * Search and lab chips filter the rows already loaded. They do not ask
 * the database for a new list.
 */
export function ModelList({
  entries,
  initialQuery = "",
}: {
  entries: readonly ModelListEntry[];
  initialQuery?: string;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [lab, setLab] = useState<string | null>(null);
  const visible = visibleEntries(entries, query, lab);

  return (
    <div>
      <ModelsPageHeader count={entries.length} />
      {entries.length === 0 ? (
        <p className="mt-8 text-sm text-muted-foreground">No models are tracked yet.</p>
      ) : (
        <>
          <div className="mt-8">
            <Input
              type="search"
              aria-label="Search models"
              placeholder="Search models"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <LabChips entries={entries} selected={lab} onSelect={setLab} />
          {visible.length === 0 ? (
            <p className="mt-6 text-sm text-muted-foreground">No models match.</p>
          ) : (
            <ul className="mt-6 overflow-hidden rounded-xl border border-border">
              {visible.map((entry) => (
                <li key={entry.href} className="border-b border-border last:border-b-0">
                  <Link
                    href={entry.href}
                    aria-label={
                      entry.retired
                        ? `${entry.modelName}, ${entry.labName}, Retired`
                        : `${entry.modelName}, ${entry.labName}`
                    }
                    className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-secondary"
                  >
                    <span className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
                      <span className="font-medium text-foreground">{entry.modelName}</span>
                      <span className="text-muted-foreground">{entry.labName}</span>
                      {entry.retired ? (
                        <span className="text-meta text-tertiary-foreground">Retired</span>
                      ) : null}
                    </span>
                    <ChevronRight
                      className="size-4 shrink-0 text-tertiary-foreground"
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
  entries: readonly ModelListEntry[],
  query: string,
  lab: string | null,
): ModelListEntry[] {
  const needle = query.trim().toLowerCase();
  return entries.filter((entry) => {
    const nameMatches = needle.length === 0 || entry.modelName.toLowerCase().includes(needle);
    const labMatches = lab === null || entry.labName === lab;
    return nameMatches && labMatches;
  });
}

function labsInOrder(entries: readonly ModelListEntry[]): { name: string; count: number }[] {
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
  entries: readonly ModelListEntry[];
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
        name="model-lab"
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
