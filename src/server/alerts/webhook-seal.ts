import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Seal a personal Slack or Discord webhook before it is stored.
 *
 * The URL has a secret token in the path. The database stores `v1.`
 * plus the locked bytes, not the URL. AES-256-GCM is the lock: it
 * hides the URL and it notices if the stored text is edited. Each
 * seal uses a new random IV (a one-time random start), so the same
 * URL does not look the same twice. The account id and the channel
 * are mixed in, so a sealed Slack value copied onto another account,
 * or into the Discord column, does not open. This file does not fetch
 * and does not open a database.
 *
 * The prefix uses a dot. An underscore would be a wildcard in SQL LIKE.
 */

const PREFIX = "v1.";
const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;

type WebhookSealChannel = "slack" | "discord";

/**
 * ALERT_WEBHOOK_KEY is missing or not 32 bytes of base64.
 *
 * The message does not include the key.
 */
export class AlertWebhookKeyError extends Error {
  constructor() {
    super("ALERT_WEBHOOK_KEY is missing or not 32 bytes.");
    this.name = "AlertWebhookKeyError";
  }
}

/**
 * The URL could not be sealed.
 *
 * The message does not include the URL, the key, or the sealed text.
 */
export class WebhookSealError extends Error {
  constructor() {
    super("Webhook seal failed.");
    this.name = "WebhookSealError";
  }
}

/**
 * Read ALERT_WEBHOOK_KEY.
 *
 * It must be 32 bytes written as base64, with no extra spaces.
 * Generate one with: openssl rand -base64 32
 */
export function readAlertWebhookKey(env: NodeJS.Dict<string>): Uint8Array {
  const raw = env.ALERT_WEBHOOK_KEY;
  if (raw == null || raw.length === 0 || raw !== raw.trim()) {
    throw new AlertWebhookKeyError();
  }
  const decoded = Buffer.from(raw, "base64");
  if (decoded.length !== KEY_BYTES || decoded.toString("base64") !== raw) {
    throw new AlertWebhookKeyError();
  }
  return decoded;
}

/**
 * The key, or null when it is missing or the wrong length.
 *
 * A post uses null to skip follower alerts. Saving a webhook uses
 * readAlertWebhookKey so the person sees a refusal instead.
 */
export function readAlertWebhookKeyOrNull(env: NodeJS.Dict<string>): Uint8Array | null {
  try {
    return readAlertWebhookKey(env);
  } catch (error) {
    if (error instanceof AlertWebhookKeyError) {
      return null;
    }
    throw error;
  }
}

export function sealWebhookUrl(input: {
  url: string;
  key: Uint8Array;
  accountId: string;
  channel: WebhookSealChannel;
}): string {
  try {
    const key = checkedKey(input.key);
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    cipher.setAAD(associatedData(input.accountId, input.channel));
    const ciphertext = Buffer.concat([cipher.update(input.url, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    if (tag.length !== TAG_BYTES || ciphertext.length === 0) {
      throw new WebhookSealError();
    }
    return PREFIX + Buffer.concat([iv, tag, ciphertext]).toString("base64");
  } catch (error) {
    if (error instanceof WebhookSealError) {
      throw error;
    }
    throw new WebhookSealError();
  }
}

/**
 * Open a sealed webhook.
 *
 * Null means the text is not a seal, the key is wrong, or the account
 * and channel do not match. The caller skips that channel.
 */
export function openWebhookUrl(input: {
  sealed: string;
  key: Uint8Array;
  accountId: string;
  channel: WebhookSealChannel;
}): string | null {
  try {
    if (!input.sealed.startsWith(PREFIX)) {
      return null;
    }
    const body = input.sealed.slice(PREFIX.length);
    const packed = Buffer.from(body, "base64");
    if (packed.toString("base64") !== body || packed.length <= IV_BYTES + TAG_BYTES) {
      return null;
    }
    const iv = packed.subarray(0, IV_BYTES);
    const tag = packed.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
    const ciphertext = packed.subarray(IV_BYTES + TAG_BYTES);
    const decipher = createDecipheriv("aes-256-gcm", checkedKey(input.key), iv);
    decipher.setAAD(associatedData(input.accountId, input.channel));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

function checkedKey(key: Uint8Array): Uint8Array {
  if (key.byteLength !== KEY_BYTES) {
    throw new WebhookSealError();
  }
  return key;
}

function associatedData(accountId: string, channel: WebhookSealChannel): Buffer {
  return Buffer.from(`${accountId}\0${channel}`, "utf8");
}
