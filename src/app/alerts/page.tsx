import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { saveWebhookAction } from "@/app/alerts/save-webhook-action";
import { AlertChannels } from "@/components/alert-channels";
import { readSignedInAccountId } from "@/server/auth/signed-in-account";
import { createDb } from "@/server/db/client";
import { findAlertWebhookStatus } from "@/server/db/repositories/alert-webhooks";
import { parseDatabaseEnv } from "@/server/env";

export const metadata: Metadata = {
  title: "Alerts · PriceTrail",
};

/**
 * Where a signed-in person saves a Slack or Discord webhook.
 *
 * A guest sees a sign-in line and no fields. The saved flags do not
 * include the URL. connection() runs before the database opens, because
 * the postgres driver calls Math.random() while it starts. This page
 * does not call publishPriceVersion().
 */
export default function AlertsPage() {
  return (
    <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-10">
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading alerts…</p>}>
        <AlertsLoader />
      </Suspense>
    </section>
  );
}

async function AlertsLoader() {
  await connection();
  const accountId = await readSignedInAccountId();
  if (accountId == null) {
    return <AlertChannels signedIn={false} slackSaved={false} discordSaved={false} action={saveWebhookAction} />;
  }

  const { databaseUrl } = parseDatabaseEnv(process.env);
  const { db, close } = createDb(databaseUrl);
  try {
    const status = await findAlertWebhookStatus(db, accountId);
    return (
      <AlertChannels
        signedIn
        slackSaved={status.slackSaved}
        discordSaved={status.discordSaved}
        action={saveWebhookAction}
      />
    );
  } finally {
    await close();
  }
}
