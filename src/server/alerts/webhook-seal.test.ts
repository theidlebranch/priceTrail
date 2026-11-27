import { describe, expect, it } from "vitest";
import {
  AlertWebhookKeyError,
  openWebhookUrl,
  readAlertWebhookKey,
  readAlertWebhookKeyOrNull,
  sealWebhookUrl,
  WebhookSealError,
} from "@/server/alerts/webhook-seal";

const URL = "https://hooks.slack.com/services/T/B/secret-token";
const ACCOUNT = "google:123";
const KEY = Buffer.alloc(32, 7);
const KEY_TEXT = KEY.toString("base64");

describe("readAlertWebhookKey", () => {
  it("reads 32 bytes of base64", () => {
    expect(Buffer.from(readAlertWebhookKey({ ALERT_WEBHOOK_KEY: KEY_TEXT }))).toEqual(KEY);
    expect(Buffer.from(readAlertWebhookKeyOrNull({ ALERT_WEBHOOK_KEY: KEY_TEXT }) ?? [])).toEqual(KEY);
  });

  it("returns null for a post when the key is missing", () => {
    expect(readAlertWebhookKeyOrNull({})).toBeNull();
    expect(readAlertWebhookKeyOrNull({ ALERT_WEBHOOK_KEY: "short-key" })).toBeNull();
  });

  it("throws when the key is missing, blank, or the wrong length", () => {
    const samples = [
      {},
      { ALERT_WEBHOOK_KEY: "" },
      { ALERT_WEBHOOK_KEY: "   " },
      { ALERT_WEBHOOK_KEY: ` ${KEY_TEXT}` },
      { ALERT_WEBHOOK_KEY: "short-key" },
      { ALERT_WEBHOOK_KEY: URL },
    ];
    for (const env of samples) {
      expect(() => readAlertWebhookKey(env)).toThrow(AlertWebhookKeyError);
      try {
        readAlertWebhookKey(env);
      } catch (error) {
        const message = error instanceof Error ? error.message : "";
        expect(message).toBe("ALERT_WEBHOOK_KEY is missing or not 32 bytes.");
        expect(message).not.toContain("secret-token");
        expect(message).not.toContain(KEY_TEXT);
        expect(message).not.toContain("short-key");
      }
    }
  });
});

describe("sealWebhookUrl", () => {
  it("opens the same URL and does not repeat the sealed text", () => {
    const first = sealWebhookUrl({ url: URL, key: KEY, accountId: ACCOUNT, channel: "slack" });
    const second = sealWebhookUrl({ url: URL, key: KEY, accountId: ACCOUNT, channel: "slack" });
    expect(first.startsWith("v1.")).toBe(true);
    expect(second.startsWith("v1.")).toBe(true);
    expect(first).not.toBe(second);
    expect(first).not.toContain("secret-token");
    expect(first).not.toContain("hooks.slack.com");
    expect(openWebhookUrl({ sealed: first, key: KEY, accountId: ACCOUNT, channel: "slack" })).toBe(URL);
    expect(openWebhookUrl({ sealed: second, key: KEY, accountId: ACCOUNT, channel: "slack" })).toBe(URL);
  });

  it("fails when a byte is flipped, or the account or channel does not match", () => {
    const sealed = sealWebhookUrl({ url: URL, key: KEY, accountId: ACCOUNT, channel: "slack" });
    const packed = Buffer.from(sealed.slice("v1.".length), "base64");
    packed[packed.length - 1] ^= 0x01;
    const flipped = `v1.${packed.toString("base64")}`;
    expect(openWebhookUrl({ sealed: flipped, key: KEY, accountId: ACCOUNT, channel: "slack" })).toBeNull();
    expect(openWebhookUrl({ sealed, key: KEY, accountId: "github:42", channel: "slack" })).toBeNull();
    expect(openWebhookUrl({ sealed, key: KEY, accountId: ACCOUNT, channel: "discord" })).toBeNull();
    expect(openWebhookUrl({ sealed, key: Buffer.alloc(32, 9), accountId: ACCOUNT, channel: "slack" })).toBeNull();
    expect(openWebhookUrl({ sealed: URL, key: KEY, accountId: ACCOUNT, channel: "slack" })).toBeNull();
  });

  it("throws on a short key and keeps the URL and the key out of the message", () => {
    const short = Buffer.alloc(16, 3);
    expect(() => sealWebhookUrl({ url: URL, key: short, accountId: ACCOUNT, channel: "discord" })).toThrow(
      WebhookSealError,
    );
    try {
      sealWebhookUrl({ url: URL, key: short, accountId: ACCOUNT, channel: "discord" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      expect(message).toBe("Webhook seal failed.");
      expect(message).not.toContain("secret-token");
      expect(message).not.toContain(URL);
      expect(message).not.toContain(short.toString("base64"));
    }
  });
});
