"use client";

import { useRef, useState, type Ref } from "react";
import Link from "next/link";
import type { FollowFormState } from "@/app/follows/follow-action";
import {
  followTabLabel,
  initialFollowTab,
  type FollowingEntry,
} from "@/app/following/following-entries";
import { FollowStar } from "@/components/follow-star";

/**
 * Labs and models stay on separate tabs. Switching tabs does not write
 * a row. The first tab is chosen once, so an unfollow stays on the tab
 * that was open.
 */

export function FollowingList({
  entries,
  signedIn,
  action,
}: {
  entries: readonly FollowingEntry[];
  signedIn: boolean;
  action: (previous: FollowFormState, formData: FormData) => Promise<FollowFormState>;
}) {
  if (!signedIn) {
    return (
      <div>
        <FollowingHeader />
        <p className="mt-8 text-sm leading-6 text-muted-foreground">
          <Link href="/sign-in" className="text-primary">
            Sign in
          </Link>{" "}
          to follow a model or a lab.
        </p>
      </div>
    );
  }

  return <SignedInFollowing entries={entries} action={action} />;
}

function SignedInFollowing({
  entries,
  action,
}: {
  entries: readonly FollowingEntry[];
  action: (previous: FollowFormState, formData: FormData) => Promise<FollowFormState>;
}) {
  const labs = entries.filter((entry) => entry.kind === "lab");
  const models = entries.filter((entry) => entry.kind === "model");
  const [tab, setTab] = useState<"labs" | "models">(() => initialFollowTab(labs.length, models.length));
  const labsTab = useRef<HTMLButtonElement>(null);
  const modelsTab = useRef<HTMLButtonElement>(null);
  const selected = tab === "labs" ? labs : models;

  return (
    <div>
      <FollowingHeader />
      <div
        role="tablist"
        aria-label="Following"
        className="mt-8 flex flex-wrap gap-2"
        onKeyDown={(event) => {
          if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
          event.preventDefault();
          // With two tabs, either direction moves to the other tab and wraps.
          (event.target === labsTab.current ? modelsTab : labsTab).current?.focus();
        }}
      >
        <FollowTab
          ref={labsTab}
          label={followTabLabel("lab", labs.length)}
          selected={tab === "labs"}
          controls="following-labs"
          onSelect={() => setTab("labs")}
        />
        <FollowTab
          ref={modelsTab}
          label={followTabLabel("model", models.length)}
          selected={tab === "models"}
          controls="following-models"
          onSelect={() => setTab("models")}
        />
      </div>
      <div
        role="tabpanel"
        id={tab === "labs" ? "following-labs" : "following-models"}
        aria-labelledby={tab === "labs" ? "following-labs-tab" : "following-models-tab"}
        className="mt-4"
      >
        {selected.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {tab === "labs"
              ? "You are not following any labs yet."
              : "You are not following any models yet."}
          </p>
        ) : (
          <ul className="overflow-hidden rounded-xl border border-border">
            {selected.map((entry) => (
              <li
                key={entry.id}
                className="flex items-center gap-3 border-b border-border px-4 py-3 last:border-b-0"
              >
                <FollowStar
                  name={entry.name}
                  kind={entry.kind}
                  followed
                  signedIn
                  labSlug={entry.labSlug}
                  modelSlug={entry.kind === "model" ? entry.modelSlug : undefined}
                  action={action}
                />
                <div className="min-w-0">
                  {entry.kind === "model" ? (
                    <Link href={entry.href} className="font-medium text-foreground hover:text-primary">
                      {entry.name}
                    </Link>
                  ) : (
                    <span className="font-medium text-foreground">{entry.name}</span>
                  )}
                  {entry.kind === "model" && entry.retired ? (
                    <span className="ml-2 text-meta text-tertiary-foreground">Retired</span>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function FollowTab({
  ref,
  label,
  selected,
  controls,
  onSelect,
}: {
  ref: Ref<HTMLButtonElement>;
  label: string;
  selected: boolean;
  controls: string;
  onSelect: () => void;
}) {
  return (
    <button
      ref={ref}
      type="button"
      role="tab"
      id={`${controls}-tab`}
      aria-controls={controls}
      aria-selected={selected}
      tabIndex={selected ? 0 : -1}
      className={
        selected
          ? "rounded-md border border-primary px-2.5 py-1 text-sm text-primary"
          : "rounded-md border border-transparent px-2.5 py-1 text-sm text-muted-foreground"
      }
      onClick={onSelect}
      onFocus={onSelect}
    >
      {label}
    </button>
  );
}

function FollowingHeader() {
  return (
    <header>
      <h1 className="text-page-title font-semibold tracking-tight">Following</h1>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
        Models and labs you follow show up here. Following a lab does not follow each of its models.
      </p>
    </header>
  );
}
