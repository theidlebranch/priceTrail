import { describe, expect, it } from "vitest";
import { labCountLabel, toLabListEntries } from "@/app/labs/lab-list";

describe("toLabListEntries", () => {
  it("keeps the name and writes a model count", () => {
    expect(
      toLabListEntries([
        { name: "Anthropic", slug: "anthropic", modelCount: 2 },
        { name: "OpenAI", slug: "openai", modelCount: 1 },
        { name: "Empty", slug: "empty", modelCount: 0 },
      ]),
    ).toEqual([
      { name: "Anthropic", slug: "anthropic", modelCountLabel: "2 models" },
      { name: "OpenAI", slug: "openai", modelCountLabel: "1 model" },
      { name: "Empty", slug: "empty", modelCountLabel: "0 models" },
    ]);
  });

  it("throws when the name, slug, count, or slug is unusable", () => {
    expect(() => toLabListEntries([{ name: "  ", slug: "anthropic", modelCount: 1 }])).toThrow(
      /lab name is empty/,
    );
    expect(() => toLabListEntries([{ name: "Anthropic", slug: "a/b", modelCount: 1 }])).toThrow(
      /lab slug/,
    );
    expect(() => toLabListEntries([{ name: "Anthropic", slug: "anthropic", modelCount: -1 }])).toThrow(
      /model count/,
    );
    expect(() =>
      toLabListEntries([
        { name: "Anthropic", slug: "anthropic", modelCount: 1 },
        { name: "Other", slug: "anthropic", modelCount: 0 },
      ]),
    ).toThrow(/share the slug/);
  });

  it("labels the page count", () => {
    expect(labCountLabel(1)).toBe("1 lab");
    expect(labCountLabel(3)).toBe("3 labs");
  });
});
