import { describe, expect, it } from "vitest";
import {
  pickModelsDevSample,
  pickRequiredEntries,
} from "./pick-witness-sample";

describe("pickRequiredEntries", () => {
  it("keeps only the requested keys", () => {
    const source = { a: { n: 1 }, b: { n: 2 }, c: { n: 3 } };
    expect(pickRequiredEntries(source, ["a", "c"])).toEqual({
      a: { n: 1 },
      c: { n: 3 },
    });
  });

  it("throws when a requested key is missing", () => {
    expect(() => pickRequiredEntries({ a: 1 }, ["a", "missing-id"])).toThrow(
      /missing-id/,
    );
  });
});

describe("pickModelsDevSample", () => {
  it("keeps the nested provider.models shape", () => {
    const api = {
      anthropic: {
        id: "anthropic",
        models: { "claude-haiku-4-5": { cost: { input: 1 } }, extra: {} },
      },
      openai: { id: "openai", models: { "gpt-5.5": { cost: { input: 2 } } } },
    };

    expect(
      pickModelsDevSample(api, [
        { provider: "anthropic", model: "claude-haiku-4-5" },
        { provider: "openai", model: "gpt-5.5" },
      ]),
    ).toEqual({
      anthropic: {
        id: "anthropic",
        models: { "claude-haiku-4-5": { cost: { input: 1 } } },
      },
      openai: {
        id: "openai",
        models: { "gpt-5.5": { cost: { input: 2 } } },
      },
    });
  });

  it("throws when a requested model is missing", () => {
    expect(() =>
      pickModelsDevSample(
        { anthropic: { id: "anthropic", models: {} } },
        [{ provider: "anthropic", model: "claude-haiku-4-5" }],
      ),
    ).toThrow(/anthropic\/claude-haiku-4-5/);
  });
});
