import { describe, expect, it } from "vitest";
import { toModelListEntries, type ModelListRow } from "./model-list-entries";

function row(overrides: Partial<ModelListRow> = {}): ModelListRow {
  return {
    labName: "Anthropic",
    labSlug: "anthropic",
    name: "Claude Fable 5.1",
    slug: "claude-fable-5.1",
    deprecatedAt: null,
    ...overrides,
  };
}

describe("toModelListEntries", () => {
  it("builds a lab-then-model path and leaves a current model unmarked", () => {
    expect(toModelListEntries([row()])).toEqual([
      {
        labName: "Anthropic",
        modelName: "Claude Fable 5.1",
        href: "/models/anthropic/claude-fable-5.1",
        retired: false,
      },
    ]);
  });

  it("marks a model retired when deprecatedAt is set", () => {
    const entries = toModelListEntries([
      row({ deprecatedAt: new Date("2026-10-18T00:00:00.000Z") }),
    ]);

    expect(entries).toEqual([
      {
        labName: "Anthropic",
        modelName: "Claude Fable 5.1",
        href: "/models/anthropic/claude-fable-5.1",
        retired: true,
      },
    ]);
  });

  it("throws when a slug is empty", () => {
    expect(() => toModelListEntries([row({ labSlug: "" })])).toThrow(/lab slug/);
  });

  it("throws when a slug contains a slash", () => {
    expect(() => toModelListEntries([row({ slug: "claude/fable" })])).toThrow(/model slug/);
  });

  it("encodes a hash or question mark so it stays one path segment", () => {
    expect(toModelListEntries([row({ slug: "model#draft" })])[0]?.href).toBe(
      "/models/anthropic/model%23draft",
    );
    expect(toModelListEntries([row({ labSlug: "lab?draft" })])[0]?.href).toBe(
      "/models/lab%3Fdraft/claude-fable-5.1",
    );
  });

  it('throws when a slug is "." or ".."', () => {
    expect(() => toModelListEntries([row({ slug: "." })])).toThrow(/model slug/);
    expect(() => toModelListEntries([row({ slug: ".." })])).toThrow(/model slug/);
    expect(() => toModelListEntries([row({ labSlug: "." })])).toThrow(/lab slug/);
    expect(() => toModelListEntries([row({ labSlug: ".." })])).toThrow(/lab slug/);
  });

  it("throws when two rows would share one public path", () => {
    expect(() =>
      toModelListEntries([
        row(),
        row({ name: "Other name", labName: "Other lab" }),
      ]),
    ).toThrow(/\/models\/anthropic\/claude-fable-5\.1/);
  });
});
