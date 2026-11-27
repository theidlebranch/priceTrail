"use client";

import { useActionState, useEffect, useRef } from "react";
import Link from "next/link";
import { Star } from "lucide-react";
import { toast } from "sonner";
import type { FollowFormState } from "@/app/follows/follow-action";
import { buttonVariants } from "@/components/ui/button";

/**
 * An empty star can be followed. A filled star is already followed.
 * The words live on the button so a screen reader does not hear only
 * "star". A guest star is a link to sign-in. That click leaves the page,
 * so it does not toast.
 */

export function FollowStar({
  name,
  kind,
  followed,
  signedIn,
  labSlug,
  modelSlug,
  action,
}: {
  name: string;
  kind: "model" | "lab";
  followed: boolean;
  signedIn: boolean;
  labSlug: string;
  modelSlug?: string;
  action: (previous: FollowFormState, formData: FormData) => Promise<FollowFormState>;
}) {
  if (!signedIn) {
    return (
      <Link
        href="/sign-in"
        aria-label={`Sign in to follow ${name}`}
        className={buttonVariants({ variant: "ghost", size: "icon-sm" })}
      >
        <Star aria-hidden="true" className="text-muted-foreground" />
      </Link>
    );
  }

  return (
    <FollowStarForm
      name={name}
      kind={kind}
      followed={followed}
      labSlug={labSlug}
      modelSlug={modelSlug}
      action={action}
    />
  );
}

function FollowStarForm({
  name,
  kind,
  followed,
  labSlug,
  modelSlug,
  action,
}: {
  name: string;
  kind: "model" | "lab";
  followed: boolean;
  labSlug: string;
  modelSlug?: string;
  action: (previous: FollowFormState, formData: FormData) => Promise<FollowFormState>;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const toasted = useRef<FollowFormState>(null);

  useEffect(() => {
    if (state === null || state === toasted.current) {
      return;
    }
    toasted.current = state;
    if (state.ok) {
      toast(state.title, state.description === undefined ? undefined : { description: state.description });
      return;
    }
    toast(state.message);
  }, [state]);

  return (
    <form action={formAction}>
      <input type="hidden" name="intent" value={followed ? "unfollow" : "follow"} />
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="labSlug" value={labSlug} />
      {modelSlug === undefined ? null : <input type="hidden" name="modelSlug" value={modelSlug} />}
      <button
        type="submit"
        disabled={pending}
        aria-pressed={followed}
        aria-label={followed ? `Unfollow ${name}` : `Follow ${name}`}
        className={buttonVariants({ variant: "ghost", size: "icon-sm" })}
      >
        <Star
          aria-hidden="true"
          fill={followed ? "currentColor" : "none"}
          className={followed ? "text-primary" : "text-muted-foreground"}
        />
      </button>
    </form>
  );
}
