/**
 * Check a Slack or Discord webhook URL before it is stored or posted.
 *
 * A blank value means the person did not set one. A URL that is not
 * https on the real host is ignored, and the caller must not log it,
 * because the path contains a secret token. This file does not fetch
 * and does not open a database.
 */

const SLACK_HOST = "hooks.slack.com";
const DISCORD_HOSTS = new Set(["discord.com", "discordapp.com"]);

export type WebhookRead = { kind: "missing" } | { kind: "ignored" } | { kind: "ok"; url: string };

/**
 * A webhook that must not be stored.
 *
 * The message does not include the URL. The caller writes nothing.
 */
export class AlertWebhookRefusal extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AlertWebhookRefusal";
  }
}

export function checkedSlackWebhook(value: string): string {
  return checkedWebhook(readSlackWebhook(value), "Type a Slack webhook URL.", "That Slack URL was not saved.");
}

export function checkedDiscordWebhook(value: string): string {
  return checkedWebhook(
    readDiscordWebhook(value),
    "Type a Discord webhook URL.",
    "That Discord URL was not saved.",
  );
}

function checkedWebhook(read: WebhookRead, missing: string, ignored: string): string {
  if (read.kind === "missing") {
    throw new AlertWebhookRefusal(missing);
  }
  if (read.kind === "ignored") {
    throw new AlertWebhookRefusal(ignored);
  }
  return read.url;
}

export function readSlackWebhook(value: string | null | undefined): WebhookRead {
  return readWebhook(value, (url) => url.hostname === SLACK_HOST);
}

export function readDiscordWebhook(value: string | null | undefined): WebhookRead {
  return readWebhook(value, (url) => DISCORD_HOSTS.has(url.hostname));
}

function readWebhook(value: string | null | undefined, hostOk: (url: URL) => boolean): WebhookRead {
  if (value == null || value.trim() === "") {
    return { kind: "missing" };
  }
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return { kind: "ignored" };
  }
  if (url.protocol !== "https:" || !hostOk(url)) {
    return { kind: "ignored" };
  }
  if (url.username !== "" || url.password !== "") {
    return { kind: "ignored" };
  }
  return { kind: "ok", url: url.toString() };
}
