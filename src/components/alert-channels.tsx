"use client";

import { useActionState } from "react";
import Link from "next/link";
import type { AlertWebhookFormState } from "@/app/alerts/save-webhook-action";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Slack and Discord for the signed-in person.
 *
 * The page says whether a URL is saved. It does not show the URL.
 * A guest gets a sign-in line and no fields that save.
 */

export function AlertChannels({
  signedIn,
  slackSaved,
  discordSaved,
  action,
}: {
  signedIn: boolean;
  slackSaved: boolean;
  discordSaved: boolean;
  action: (previous: AlertWebhookFormState, formData: FormData) => Promise<AlertWebhookFormState>;
}) {
  return (
    <div>
      <h1 className="text-page-title font-semibold tracking-tight">Alerts</h1>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
        A message is sent only when a price you follow is published. A card that is still in review
        does not message you. Email is not part of this page.
      </p>
      {signedIn ? (
        <div className="mt-8 max-w-md space-y-8">
          <ChannelForm
            label="Slack"
            channel="slack"
            saved={slackSaved}
            placeholder="https://hooks.slack.com/..."
            action={action}
          />
          <ChannelForm
            label="Discord"
            channel="discord"
            saved={discordSaved}
            placeholder="https://discord.com/api/webhooks/..."
            action={action}
          />
        </div>
      ) : (
        <p className="mt-8 text-sm leading-6 text-muted-foreground">
          <Link href="/sign-in" className="text-primary">
            Sign in
          </Link>{" "}
          to save a Slack or Discord webhook.
        </p>
      )}
    </div>
  );
}

function ChannelForm({
  label,
  channel,
  saved,
  placeholder,
  action,
}: {
  label: string;
  channel: "slack" | "discord";
  saved: boolean;
  placeholder: string;
  action: (previous: AlertWebhookFormState, formData: FormData) => Promise<AlertWebhookFormState>;
}) {
  const [state, formAction, pending] = useActionState<AlertWebhookFormState, FormData>(action, null);

  return (
    <div className="space-y-3">
      <p className="text-sm text-foreground">
        {saved ? `${label} is saved` : `${label} is not saved`}
      </p>
      <form action={formAction} className="space-y-3">
        <input type="hidden" name="channel" value={channel} />
        <input type="hidden" name="intent" value="replace" />
        <label className="block space-y-2 text-sm leading-6">
          <span className="text-foreground">Replace {label}</span>
          <Input name="url" type="url" autoComplete="off" placeholder={placeholder} disabled={pending} />
        </label>
        {state?.ok === false ? <p className="text-sm leading-6 text-destructive">{state.message}</p> : null}
        {state?.ok === true ? <p className="text-sm leading-6 text-muted-foreground">{state.message}</p> : null}
        <button type="submit" disabled={pending} className={buttonVariants({ size: "sm" })}>
          Save {label}
        </button>
      </form>
      {saved ? (
        <form action={formAction}>
          <input type="hidden" name="channel" value={channel} />
          <input type="hidden" name="intent" value="remove" />
          <button
            type="submit"
            disabled={pending}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Remove {label}
          </button>
        </form>
      ) : null}
    </div>
  );
}
