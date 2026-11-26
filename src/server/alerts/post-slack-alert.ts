import { siteAlertLines, type SiteAlertEvent } from "@/core/alerts/site-alert";
import { redactSecrets } from "@/server/db/seed";
import type { FetchLike } from "@/server/sources/provider-source";

/**
 * Post one site-wide Slack message.
 *
 * The caller passes fetch, so a test never calls Slack. A missing URL
 * skips the post. A URL that is not https on hooks.slack.com is skipped,
 * and the log does not print it, because the URL contains a secret token.
 * A failed post is logged and does not throw, so a visit or a published
 * price stays as it was. This file does not call publishPriceVersion().
 */

const SLACK_HOST = "hooks.slack.com";
const POST_TIMEOUT_MS = 10_000;
const SLACK_TEXT_LIMIT = 40_000;
const SUMMARY_LABELS: Record<SiteAlertEvent["kind"], string> = {
  new_model: "New models",
  retirement: "Possible retirements",
  gone: "Missing models",
  parser_suspect: "Unreadable pricing pages",
  price_published: "Published prices",
};

export async function postSlackAlert(input: {
  events: readonly SiteAlertEvent[];
  env: NodeJS.Dict<string>;
  fetchImpl: FetchLike;
}): Promise<void> {
  let text: string;
  try {
    text = siteAlertLines(input.events);
    if (text.length > SLACK_TEXT_LIMIT) {
      text = summarizeAlert(input.events);
    }
  } catch (error: unknown) {
    console.error(failureText(error, []));
    return;
  }
  if (text === "") {
    return;
  }

  const webhook = readSlackWebhook(input.env.SLACK_WEBHOOK_URL);
  if (webhook.kind === "missing") {
    return;
  }
  if (webhook.kind === "ignored") {
    console.error("Slack webhook URL was ignored");
    return;
  }

  try {
    const response = await input.fetchImpl(webhook.url, {
      method: "POST",
      redirect: "manual",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(POST_TIMEOUT_MS),
    });
    await response.body?.cancel();
    if (!response.ok || response.status >= 300) {
      console.error(`Slack post failed: ${response.status}`);
    }
  } catch (error: unknown) {
    console.error(failureText(error, [webhook.url]));
  }
}

function summarizeAlert(events: readonly SiteAlertEvent[]): string {
  const counts = new Map<SiteAlertEvent["kind"], number>();
  for (const { kind } of events) {
    counts.set(kind, (counts.get(kind) ?? 0) + 1);
  }
  return [
    "Site alert summary (details exceed Slack's message limit):",
    ...Array.from(counts, ([kind, count]) => `${SUMMARY_LABELS[kind]}: ${count}`),
  ].join("\n");
}

type SlackWebhook = { kind: "missing" } | { kind: "ignored" } | { kind: "ok"; url: string };

function readSlackWebhook(value: string | undefined): SlackWebhook {
  if (value === undefined || value.trim() === "") {
    return { kind: "missing" };
  }
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return { kind: "ignored" };
  }
  if (url.protocol !== "https:" || url.hostname !== SLACK_HOST) {
    return { kind: "ignored" };
  }
  if (url.username !== "" || url.password !== "") {
    return { kind: "ignored" };
  }
  return { kind: "ok", url: url.toString() };
}

function failureText(error: unknown, secrets: readonly string[]): string {
  const message = error instanceof Error ? error.message : "Slack post failed";
  const text = message.trim() === "" ? "Slack post failed" : message;
  const redacted = redactSecrets(text, secrets);
  if (redacted.startsWith("Slack post failed")) {
    return redacted;
  }
  return `Slack post failed: ${redacted}`;
}
