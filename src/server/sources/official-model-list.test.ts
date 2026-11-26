import { describe, expect, it } from "vitest";
import type { FetchLike } from "@/server/sources/provider-source";
import {
  downloadOfficialModelList,
  GOOGLE_MODELS_URL,
  OfficialListReadError,
  OPENAI_MODELS_URL,
} from "@/server/sources/official-model-list";

const OPENAI_KEY = "test-openai-key";
const ANTHROPIC_KEY = "test-anthropic-key";
const GOOGLE_KEY = "test-google-key";

describe("downloadOfficialModelList", () => {
  it("sends the OpenAI key as a bearer header and not in the URL", async () => {
    const payload = await downloadOfficialModelList("openai", OPENAI_KEY, async (url, init) => {
      expect(url).toBe(OPENAI_MODELS_URL);
      expect(url.includes(OPENAI_KEY)).toBe(false);
      expect(new Headers(init?.headers).get("authorization")).toBe(`Bearer ${OPENAI_KEY}`);
      return json({ data: [{ id: "gpt-6-sol" }] });
    });

    expect(payload).toEqual({ data: [{ id: "gpt-6-sol" }] });
  });

  it("follows Anthropic pages and lets a retired row replace the same id", async () => {
    const seen: string[] = [];
    const payload = await downloadOfficialModelList("anthropic", ANTHROPIC_KEY, async (url, init) => {
      seen.push(url);
      expect(url.includes(ANTHROPIC_KEY)).toBe(false);
      const headers = new Headers(init?.headers);
      expect(headers.get("authorization")).toBe(`Bearer ${ANTHROPIC_KEY}`);
      expect(headers.get("anthropic-version")).toBe("2026-10-21");
      if (url.includes("after_id=")) {
        return json({ data: [{ id: "claude-page-2", lifecycle: "active" }], has_more: false });
      }
      if (url.includes("lifecycle")) {
        expect(url).toContain("lifecycle%5B%5D=retired");
        return json({
          data: [{ id: "claude-fable-5", lifecycle: "retired" }],
          has_more: false,
        });
      }
      return json({
        data: [{ id: "claude-fable-5", lifecycle: "active" }],
        has_more: true,
        last_id: "claude-fable-5",
      });
    });

    expect(seen.some((url) => url.includes("after_id="))).toBe(true);
    expect(seen.some((url) => url.includes("lifecycle"))).toBe(true);
    expect(payload).toEqual({
      data: [
        { id: "claude-fable-5", lifecycle: "retired" },
        { id: "claude-page-2", lifecycle: "active" },
      ],
    });
  });

  it("sends the Google key as a header and follows nextPageToken", async () => {
    const payload = await downloadOfficialModelList("google", GOOGLE_KEY, async (url, init) => {
      expect(url.startsWith(GOOGLE_MODELS_URL)).toBe(true);
      expect(url.includes(GOOGLE_KEY)).toBe(false);
      expect(new Headers(init?.headers).get("x-goog-api-key")).toBe(GOOGLE_KEY);
      const token = new URL(url).searchParams.get("pageToken");
      if (token === null) {
        return json({ models: [{ name: "models/gemini-a" }], nextPageToken: "next" });
      }
      expect(token).toBe("next");
      return json({ models: [{ name: "models/gemini-b" }] });
    });

    expect(payload).toEqual({
      models: [{ name: "models/gemini-a" }, { name: "models/gemini-b" }],
    });
  });

  it("reports a failed download without keeping the body", async () => {
    const fetchImpl: FetchLike = async () => new Response("secret body", { status: 403 });
    await expect(downloadOfficialModelList("openai", OPENAI_KEY, fetchImpl)).rejects.toMatchObject({
      outcome: "fetch_error",
      name: "OfficialListReadError",
    });
    await expect(downloadOfficialModelList("openai", OPENAI_KEY, fetchImpl)).rejects.toBeInstanceOf(
      OfficialListReadError,
    );
  });
});

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200 });
}
