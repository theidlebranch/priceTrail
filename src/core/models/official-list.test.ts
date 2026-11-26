import { describe, expect, it } from "vitest";
import {
  classifyOfficialList,
  isOfficialChatModel,
  parseAnthropicModelList,
  parseGoogleModelList,
  parseOpenAiModelList,
  tokenLimitSentence,
  type OfficialModel,
} from "@/core/models/official-list";

const OBSERVED = new Date("2026-11-26T18:04:00.000Z");

describe("official model list filters", () => {
  it("skips a dated snapshot, a moving alias, and a non-chat OpenAI id", () => {
    expect(chat("openai", "gpt-6-sol")).toBe(true);
    expect(chat("openai", "gpt-5.4-2026-03-05")).toBe(false);
    expect(chat("openai", "gpt-5.4-03-2026")).toBe(false);
    expect(chat("openai", "chatgpt-4o-latest")).toBe(false);
    for (const slug of [
      "gpt-4o-mini-tts",
      "whisper-1",
      "gpt-4o-transcribe",
      "gpt-4o-realtime-preview",
      "gpt-image-1",
      "text-embedding-3-small",
      "omni-moderation-latest",
      "gpt-4o-mini-search-api",
      "gpt-4o-audio-preview",
      "gpt-4o-transcribe-diarize",
    ]) {
      expect(chat("openai", slug)).toBe(false);
    }
    expect(chat("openai", "text-moderation-latest")).toBe(false);
    expect(chat("openai", "omni-moderation")).toBe(false);
  });

  it("keeps an Anthropic chat id and still skips a dated snapshot", () => {
    expect(chat("anthropic", "claude-fable-5")).toBe(true);
    expect(chat("anthropic", "claude-fable-5-2026-03-05")).toBe(false);
    expect(chat("anthropic", "claude-fable-latest")).toBe(false);
  });

  it("requires generateContent and skips Google products that are not chat", () => {
    expect(chat("google", "gemini-4-argon", ["generateContent"])).toBe(true);
    expect(chat("google", "gemini-4-argon", ["embedContent"])).toBe(false);
    expect(chat("google", "gemini-4-argon", [])).toBe(false);
    expect(chat("google", "gemini-flash-latest", ["generateContent"])).toBe(false);
    expect(chat("google", "gemini-4-argon-2026-03-05", ["generateContent"])).toBe(false);
    for (const slug of [
      "gemini-image",
      "gemini-tts",
      "gemini-embed",
      "lyria-2",
      "gemini-transcribe",
      "gemini-live",
      "gemini-robot",
      "gemini-audio",
      "gemini-music",
      "gemini-aqa",
      "gemini-decision",
    ]) {
      expect(chat("google", slug, ["generateContent"])).toBe(false);
    }
  });
});

describe("official model list parsers", () => {
  it("reads an OpenAI id and a shutdown date, and stores no token count", () => {
    const models = parseOpenAiModelList({
      data: [
        { id: "gpt-6-sol", created: 1, owned_by: "openai", max_input_tokens: 100 },
        { id: "gpt-old", created: 2, owned_by: "openai", shutdown_date: "2027-06-01" },
        { id: "gpt-current", created: 3, owned_by: "openai", shutdown_date: null },
      ],
    });

    expect(models).toEqual([
      expect.objectContaining({
        slug: "gpt-6-sol",
        maxInputTokens: null,
        maxOutputTokens: null,
        retiring: false,
        hint: null,
      }),
      expect.objectContaining({
        slug: "gpt-old",
        retiring: true,
        hint: "Shutdown date 2027-06-01.",
      }),
      expect.objectContaining({ slug: "gpt-current", retiring: false }),
    ]);
  });

  it("reads Anthropic limits, the display name, and a deprecated lifecycle", () => {
    const models = parseAnthropicModelList({
      data: [
        {
          id: "claude-fable-5",
          display_name: "Claude Fable 5.1",
          max_input_tokens: 1_000_000,
          max_tokens: 128_000,
          lifecycle: "active",
          capabilities: { chat: true },
        },
        {
          id: "claude-old",
          display_name: "Claude Old",
          max_input_tokens: 200_000,
          max_tokens: 8_192,
          lifecycle: "deprecated",
          deprecated_at: "2026-11-01T00:00:00Z",
          retires_at: "2027-01-01T00:00:00Z",
        },
      ],
    });

    expect(models[0]).toMatchObject({
      slug: "claude-fable-5",
      displayName: "Claude Fable 5.1",
      maxInputTokens: 1_000_000,
      maxOutputTokens: 128_000,
      retiring: false,
    });
    expect(models[1]?.hint).toBe(
      "Lifecycle deprecated. Deprecated at 2026-11-01T00:00:00Z. Retires at 2027-01-01T00:00:00Z.",
    );
  });

  it("reads a Google name after models/ and never marks it retiring", () => {
    const models = parseGoogleModelList({
      models: [
        {
          name: "models/gemini-4-argon",
          displayName: "Gemini 4 Argon",
          inputTokenLimit: 1_048_576,
          outputTokenLimit: 32_768,
          supportedGenerationMethods: ["generateContent"],
        },
      ],
    });

    expect(models).toEqual([
      {
        slug: "gemini-4-argon",
        displayName: "Gemini 4 Argon",
        maxInputTokens: 1_048_576,
        maxOutputTokens: 32_768,
        supportedGenerationMethods: ["generateContent"],
        retiring: false,
        hint: null,
      },
    ]);
  });

  it("rejects a token count that is not a positive whole number", () => {
    expect(() =>
      parseAnthropicModelList({
        data: [{ id: "claude-fable-5", max_input_tokens: 1.5, lifecycle: "active" }],
      }),
    ).toThrow(/positive whole number/);
  });
});

describe("classifyOfficialList", () => {
  it("remembers ids and limits on the first read and opens no card", () => {
    const change = classifyOfficialList({
      lab: "anthropic",
      models: [
        model({
          slug: "claude-fable-5",
          displayName: "Claude Fable 5.1",
          maxInputTokens: 1_000_000,
          maxOutputTokens: 128_000,
        }),
        model({ slug: "claude-mythos-5", maxInputTokens: 200_000 }),
        model({ slug: "claude-dated-2026-03-05", maxInputTokens: 10 }),
      ],
      trackedSlugs: new Set(["claude-fable-5"]),
      previousSeenSlugs: null,
      previousRetiringSlugs: [],
      existingCandidateSlugs: new Set(),
    });

    expect(change.isBaseline).toBe(true);
    expect(change.newNames).toEqual([]);
    expect(change.retirements).toEqual([]);
    expect(change.seenSlugs).toEqual(["claude-fable-5", "claude-mythos-5"]);
    expect(change.limits).toEqual([
      { slug: "claude-fable-5", maxInputTokens: 1_000_000, maxOutputTokens: 128_000 },
    ]);
  });

  it("does not write an OpenAI limit, even for a tracked id", () => {
    const change = classifyOfficialList({
      lab: "openai",
      models: [model({ slug: "gpt-6-sol" })],
      trackedSlugs: new Set(["gpt-6-sol"]),
      previousSeenSlugs: null,
      previousRetiringSlugs: [],
      existingCandidateSlugs: new Set(),
    });

    expect(change.limits).toEqual([]);
  });

  it("cards a later chat id we do not track, and skips snapshots and aliases", () => {
    const change = classifyOfficialList({
      lab: "google",
      models: [
        model({ slug: "gemini-4-argon", maxInputTokens: 1_048_576, maxOutputTokens: 32_768, methods: ["generateContent"] }),
        model({ slug: "gemini-new", displayName: "Gemini New", methods: ["generateContent"] }),
        model({ slug: "gemini-flash-latest", methods: ["generateContent"] }),
        model({ slug: "gemini-embed", methods: ["embedContent"] }),
        model({ slug: "gemini-4-argon-2026-03-05", methods: ["generateContent"] }),
      ],
      trackedSlugs: new Set(["gemini-4-argon"]),
      previousSeenSlugs: ["gemini-4-argon"],
      previousRetiringSlugs: [],
      existingCandidateSlugs: new Set(),
    });

    expect(change.isBaseline).toBe(false);
    expect(change.newNames).toEqual([{ slug: "gemini-new", rawName: "Gemini New" }]);
    expect(change.retirements).toEqual([]);
    expect(change.limits).toEqual([
      { slug: "gemini-4-argon", maxInputTokens: 1_048_576, maxOutputTokens: 32_768 },
    ]);
  });

  it("opens a retirement card only when the chat id was not retiring before", () => {
    const retiring = model({
      slug: "gpt-6-sol",
      retiring: true,
      hint: "Shutdown date 2027-06-01.",
    });
    const dated = model({
      slug: "gpt-5.4-2026-03-05",
      retiring: true,
      hint: "Shutdown date 2026-04-01.",
    });
    const first = classifyOfficialList({
      lab: "openai",
      models: [retiring, dated, model({ slug: "gpt-fresh" })],
      trackedSlugs: new Set(["gpt-6-sol", "gpt-mythos"]),
      previousSeenSlugs: ["gpt-6-sol", "gpt-fresh"],
      previousRetiringSlugs: [],
      existingCandidateSlugs: new Set(),
    });

    expect(first.retirements).toEqual([
      { slug: "gpt-6-sol", rawName: "gpt-6-sol", hint: "Shutdown date 2027-06-01." },
    ]);
    expect(first.newNames).toEqual([]);
    expect(first.seenSlugs).not.toContain("gpt-mythos");

    const again = classifyOfficialList({
      lab: "openai",
      models: [retiring, dated],
      trackedSlugs: new Set(["gpt-6-sol"]),
      previousSeenSlugs: first.seenSlugs,
      previousRetiringSlugs: first.retiringSlugs,
      existingCandidateSlugs: new Set(["gpt-6-sol"]),
    });
    expect(again.retirements).toEqual([]);
    expect(again.newNames).toEqual([]);
  });

  it("uses one retirement card when a new id is already retiring", () => {
    const change = classifyOfficialList({
      lab: "anthropic",
      models: [
        model({
          slug: "claude-old",
          displayName: "Claude Old",
          retiring: true,
          hint: "Lifecycle retired.",
        }),
      ],
      trackedSlugs: new Set(),
      previousSeenSlugs: [],
      previousRetiringSlugs: [],
      existingCandidateSlugs: new Set(),
    });

    expect(change.newNames).toEqual([]);
    expect(change.retirements).toEqual([
      { slug: "claude-old", rawName: "Claude Old", hint: "Lifecycle retired." },
    ]);
  });

  it("does not card a slug that already has a row", () => {
    const change = classifyOfficialList({
      lab: "anthropic",
      models: [model({ slug: "claude-new" })],
      trackedSlugs: new Set(),
      previousSeenSlugs: [],
      previousRetiringSlugs: [],
      existingCandidateSlugs: new Set(["claude-new"]),
    });

    expect(change.newNames).toEqual([]);
  });
});

describe("tokenLimitSentence", () => {
  it("formats both counts, or the one count that exists, with the UTC day", () => {
    expect(
      tokenLimitSentence({
        maxInputTokens: 1_000_000,
        maxOutputTokens: 128_000,
        observedAt: OBSERVED,
        listName: "Anthropic",
      }),
    ).toBe(
      "input limit 1,000,000 tokens, output limit 128,000 tokens, read from the Anthropic model list on Nov 26, 2026 UTC.",
    );
    expect(
      tokenLimitSentence({
        maxInputTokens: 1_048_576,
        maxOutputTokens: null,
        observedAt: OBSERVED,
        listName: "Google",
      }),
    ).toBe("input limit 1,048,576 tokens, read from the Google model list on Nov 26, 2026 UTC.");
  });
});

function chat(lab: "openai" | "anthropic" | "google", slug: string, methods?: string[]): boolean {
  return isOfficialChatModel(lab, {
    slug,
    supportedGenerationMethods: methods ?? null,
  });
}

function model(overrides: Partial<OfficialModel> & { slug: string; methods?: string[] }): OfficialModel {
  return {
    slug: overrides.slug,
    displayName: overrides.displayName ?? null,
    maxInputTokens: overrides.maxInputTokens ?? null,
    maxOutputTokens: overrides.maxOutputTokens ?? null,
    supportedGenerationMethods: overrides.methods ?? overrides.supportedGenerationMethods ?? null,
    retiring: overrides.retiring ?? false,
    hint: overrides.hint ?? null,
  };
}
