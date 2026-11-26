import { siteAlertLines, type SiteAlertEvent } from "@/core/alerts/site-alert";
import { redactSecrets } from "@/server/db/seed";
import type { FetchLike } from "@/server/sources/provider-source";

/**
 * Post one site-wide Discord message.
 *
 * The caller passes fetch, so a test never calls Discord. A missing URL
 * skips the post. A URL that is not https on discord.com or discordapp.com
 * is skipped, and the log does not print it, because the URL contains a
 * secret token. A failed post is logged and does not throw, so a visit or
 * a published price stays as it was. This file does not call
 * publishPriceVersion().
 */

const DISCORD_HOSTS = new Set(["discord.com", "discordapp.com"]);
const POST_TIMEOUT_MS = 10_000;

export async function postDiscordAlert(input: {
  events: readonly SiteAlertEvent[];
  env: NodeJS.Dict<string>;
  fetchImpl: FetchLike;
}): Promise<void> {
  let content: string;
  try {
    content = siteAlertLines(input.events);
  } catch (error: unknown) {
    console.error(failureText(error, []));
    return;
  }
  if (content === "") {
    return;
  }

  const webhook = readDiscordWebhook(input.env.DISCORD_WEBHOOK_URL);
  if (webhook.kind === "missing") {
    return;
  }
  if (webhook.kind === "ignored") {
    console.error("Discord webhook URL was ignored");
    return;
  }

  try {
    const response = await input.fetchImpl(webhook.url, {
      method: "POST",
      redirect: "manual",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content }),
      signal: AbortSignal.timeout(POST_TIMEOUT_MS),
    });
    await response.body?.cancel();
    if (!response.ok || response.status >= 300) {
      console.error(`Discord post failed: ${response.status}`);
    }
  } catch (error: unknown) {
    console.error(failureText(error, [webhook.url]));
  }
}

type DiscordWebhook = { kind: "missing" } | { kind: "ignored" } | { kind: "ok"; url: string };

function readDiscordWebhook(value: string | undefined): DiscordWebhook {
  if (value === undefined || value.trim() === "") {
    return { kind: "missing" };
  }
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return { kind: "ignored" };
  }
  if (url.protocol !== "https:" || !DISCORD_HOSTS.has(url.hostname)) {
    return { kind: "ignored" };
  }
  if (url.username !== "" || url.password !== "") {
    return { kind: "ignored" };
  }
  return { kind: "ok", url: url.toString() };
}

function failureText(error: unknown, secrets: readonly string[]): string {
  const message = error instanceof Error ? error.message : "Discord post failed";
  const text = message.trim() === "" ? "Discord post failed" : message;
  const redacted = redactSecrets(text, secrets);
  if (redacted.startsWith("Discord post failed")) {
    return redacted;
  }
  return `Discord post failed: ${redacted}`;
}
