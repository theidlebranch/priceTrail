import { afterEach, describe, expect, it, vi } from "vitest";
import { postSlackAlert } from "@/server/alerts/post-slack-alert";
import type { FetchLike } from "@/server/sources/provider-source";

const WEBHOOK = "https://hooks.slack.com/services/T/B/secret-token";
const EVENT = { kind: "parser_suspect" as const, lab: "anthropic" };

describe("postSlackAlert", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does not call fetch when the URL is missing, blank, or there is nothing to say", async () => {
    const fetchImpl = vi.fn<FetchLike>();

    await postSlackAlert({ events: [EVENT], env: {}, fetchImpl });
    await postSlackAlert({ events: [EVENT], env: { SLACK_WEBHOOK_URL: "   " }, fetchImpl });
    await postSlackAlert({ events: [], env: { SLACK_WEBHOOK_URL: WEBHOOK }, fetchImpl });

    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("skips a URL that is not https on hooks.slack.com and does not log it", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchImpl = vi.fn<FetchLike>();
    const bad = "https://evil.example/hook-secret-zzz";

    await postSlackAlert({
      events: [EVENT],
      env: { SLACK_WEBHOOK_URL: bad },
      fetchImpl,
    });
    await postSlackAlert({
      events: [EVENT],
      env: { SLACK_WEBHOOK_URL: "http://hooks.slack.com/services/T/B/secret-token" },
      fetchImpl,
    });

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledTimes(2);
    const logged = errorSpy.mock.calls.map((call) => String(call[0])).join("\n");
    expect(logged).toContain("Slack webhook URL was ignored");
    expect(logged).not.toContain("hook-secret-zzz");
    expect(logged).not.toContain("secret-token");
  });

  it("posts one JSON body whose text is the alert lines", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchImpl = vi.fn<FetchLike>(async () => new Response("ok", { status: 200 }));

    await postSlackAlert({
      events: [
        { kind: "new_model", lab: "anthropic", model: "Claude Example" },
        { kind: "price_published", lab: "openai", model: "gpt-6-sol" },
      ],
      env: { SLACK_WEBHOOK_URL: `  ${WEBHOOK}  ` },
      fetchImpl,
    });

    expect(errorSpy).not.toHaveBeenCalled();
    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, init] = fetchImpl.mock.calls[0] ?? [];
    expect(url).toBe(WEBHOOK);
    expect(init?.method).toBe("POST");
    expect(init?.redirect).toBe("manual");
    expect(new Headers(init?.headers).get("content-type")).toBe("application/json");
    expect(JSON.parse(String(init?.body))).toEqual({
      text: [
        "Anthropic: Claude Example is a new model waiting for review.",
        "OpenAI: gpt-6-sol has a new published price.",
      ].join("\n"),
    });
  });

  it.each([
    {
      events: [
        ...Array.from({ length: 700 }, () => ({
          kind: "new_model" as const,
          lab: "anthropic",
          model: "Claude Example",
        })),
        EVENT,
      ],
      summary: ["New models: 700", "Unreadable pricing pages: 1"],
    },
    {
      events: [{ kind: "price_published" as const, lab: "openai", model: "x".repeat(40_001) }],
      summary: ["Published prices: 1"],
    },
  ])("posts one bounded summary when the alert is too long ($summary)", async ({ events, summary }) => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchImpl = vi.fn<FetchLike>(async () => new Response("ok", { status: 200 }));

    await postSlackAlert({ events, env: { SLACK_WEBHOOK_URL: WEBHOOK }, fetchImpl });

    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(errorSpy).not.toHaveBeenCalled();
    const { text } = JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body));
    expect(text.length).toBeLessThanOrEqual(40_000);
    expect(text).toContain("Site alert summary (details exceed Slack's message limit):");
    for (const line of summary) {
      expect(text).toContain(line);
    }
  });

  it("logs a failed post without throwing or printing the webhook URL", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchImpl = vi.fn<FetchLike>(async () => new Response("nope", { status: 500 }));

    await expect(
      postSlackAlert({ events: [EVENT], env: { SLACK_WEBHOOK_URL: WEBHOOK }, fetchImpl }),
    ).resolves.toBeUndefined();

    expect(String(errorSpy.mock.calls[0]?.[0])).toContain("500");
    expect(String(errorSpy.mock.calls[0]?.[0])).not.toContain("secret-token");
  });

  it("logs a thrown fetch without throwing or printing the webhook URL", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchImpl = vi.fn<FetchLike>(async () => {
      throw new Error(`connect failed for ${WEBHOOK}`);
    });

    await expect(
      postSlackAlert({ events: [EVENT], env: { SLACK_WEBHOOK_URL: WEBHOOK }, fetchImpl }),
    ).resolves.toBeUndefined();

    const logged = String(errorSpy.mock.calls[0]?.[0]);
    expect(logged).toContain("Slack post failed");
    expect(logged).not.toContain("secret-token");
    expect(logged).not.toContain(WEBHOOK);
  });
});
