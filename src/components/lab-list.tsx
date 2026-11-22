"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import type { LabListEntry } from "@/app/labs/lab-list";
import { LabsPageHeader } from "@/components/labs-page-header";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type SuggestLabState = { ok: false; message: string; name: string } | null;

type NameField = { state: SuggestLabState; key: number };

/**
 * The labs we track, plus a form for a lab we do not.
 *
 * The form is shown only when the visitor is signed in. Suggesting a
 * name does not add the lab. A refusal puts the typed name back.
 */
export function LabList({
  entries,
  signedIn,
  action,
}: {
  entries: readonly LabListEntry[];
  signedIn: boolean;
  action: (previous: SuggestLabState, formData: FormData) => Promise<SuggestLabState>;
}) {
  return (
    <div>
      <LabsPageHeader count={entries.length} />
      {entries.length === 0 ? (
        <p className="mt-8 text-sm text-muted-foreground">No labs are tracked yet.</p>
      ) : (
        <ul className="mt-8 overflow-hidden rounded-xl border border-border">
          {entries.map((entry) => (
            <li
              key={entry.slug}
              className="flex items-baseline justify-between gap-4 border-b border-border px-4 py-3 last:border-b-0"
            >
              <span className="font-medium text-foreground">{entry.name}</span>
              <span className="text-meta text-tertiary-foreground tabular-nums">
                {entry.modelCountLabel}
              </span>
            </li>
          ))}
        </ul>
      )}
      {signedIn ? (
        <SuggestLabForm action={action} />
      ) : (
        <p className="mt-8 text-sm leading-6 text-muted-foreground">
          <Link href="/sign-in" className="text-primary">
            Sign in
          </Link>{" "}
          to suggest a lab we do not track.
        </p>
      )}
    </div>
  );
}

function SuggestLabForm({
  action,
}: {
  action: (previous: SuggestLabState, formData: FormData) => Promise<SuggestLabState>;
}) {
  const [state, formAction, pending] = useActionState<SuggestLabState, FormData>(action, null);
  const [field, setField] = useState<NameField>({ state, key: 0 });
  const nextField = nextNameFieldKey(field, state);
  if (nextField !== field) {
    setField(nextField);
  }
  const name = state?.ok === false ? state.name : "";

  return (
    <form action={formAction} className="mt-8 max-w-md space-y-3" key={field.key}>
      <label className="block space-y-2 text-sm leading-6">
        <span className="text-foreground">Suggest a lab</span>
        <Input name="labName" required aria-label="Lab name" disabled={pending} defaultValue={name} />
      </label>
      <p className="text-sm leading-6 text-muted-foreground">
        A reviewer accepts or declines the name. Accepting it does not start tracking the lab.
      </p>
      {state?.ok === false ? <p className="text-sm leading-6 text-destructive">{state.message}</p> : null}
      <button type="submit" disabled={pending} className={buttonVariants({ size: "sm" })}>
        Suggest lab
      </button>
    </form>
  );
}

function nextNameFieldKey(previous: NameField, state: SuggestLabState): NameField {
  if (state === previous.state) {
    return previous;
  }
  if (state?.ok === false) {
    return { state, key: previous.key + 1 };
  }
  return { state, key: previous.key };
}
