import { describe, expect, it } from "vitest";
import {
  checkedDiscordWebhook,
  checkedSlackWebhook,
  readDiscordWebhook,
  readSlackWebhook,
} from "@/core/alerts/webhook-url";

const SLACK = "https://hooks.slack.com/services/T/B/secret-token";
const DISCORD = "https://discord.com/api/webhooks/123/secret-token";

describe("readSlackWebhook", () => {
  it("accepts an https hooks.slack.com URL and trims it", () => {
    expect(readSlackWebhook(`  ${SLACK}  `)).toEqual({ kind: "ok", url: SLACK });
  });

  it("treats a blank value as missing", () => {
    expect(readSlackWebhook(undefined)).toEqual({ kind: "missing" });
    expect(readSlackWebhook(null)).toEqual({ kind: "missing" });
    expect(readSlackWebhook("   ")).toEqual({ kind: "missing" });
  });

  it("ignores http, the wrong host, a username, and text that is not a URL", () => {
    expect(readSlackWebhook("http://hooks.slack.com/services/T/B/secret-token").kind).toBe("ignored");
    expect(readSlackWebhook("https://evil.example/hook-secret-zzz").kind).toBe("ignored");
    expect(readSlackWebhook("https://user:pass@hooks.slack.com/services/T/B/secret-token").kind).toBe(
      "ignored",
    );
    expect(readSlackWebhook("not a url").kind).toBe("ignored");
  });
});

describe("readDiscordWebhook", () => {
  it("accepts https on discord.com and discordapp.com", () => {
    expect(readDiscordWebhook(DISCORD)).toEqual({ kind: "ok", url: DISCORD });
    expect(readDiscordWebhook("https://discordapp.com/api/webhooks/9/other-token")).toEqual({
      kind: "ok",
      url: "https://discordapp.com/api/webhooks/9/other-token",
    });
  });

  it("treats a blank value as missing", () => {
    expect(readDiscordWebhook("")).toEqual({ kind: "missing" });
  });

  it("ignores http, the wrong host, and a username", () => {
    expect(readDiscordWebhook("http://discord.com/api/webhooks/123/secret-token").kind).toBe("ignored");
    expect(readDiscordWebhook("https://evil.example/hook-secret-zzz").kind).toBe("ignored");
    expect(readDiscordWebhook("https://user:secret-token@discord.com/api/webhooks/123/secret-token").kind).toBe(
      "ignored",
    );
  });
});

describe("checked webhook URLs", () => {
  it("returns the trimmed URL", () => {
    expect(checkedSlackWebhook(`  ${SLACK}  `)).toBe(SLACK);
    expect(checkedDiscordWebhook(DISCORD)).toBe(DISCORD);
  });

  it("refuses a blank or bad URL without repeating it", () => {
    expect(() => checkedSlackWebhook("   ")).toThrow(/Type a Slack webhook URL/);
    expect(() => checkedSlackWebhook("https://evil.example/hook-secret-zzz")).toThrow(
      "That Slack URL was not saved.",
    );
    expect(() => checkedDiscordWebhook("https://evil.example/hook-secret-zzz")).toThrow(
      "That Discord URL was not saved.",
    );
  });
});
