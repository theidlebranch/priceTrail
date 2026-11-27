import { describe, expect, it } from "vitest";
import {
  followTabLabel,
  initialFollowTab,
  toFollowingEntries,
} from "@/app/following/following-entries";
import type { ListedFollow } from "@/server/db/repositories/follows";

const WHEN = new Date("2026-11-27T12:00:00.000Z");

describe("toFollowingEntries", () => {
  it("builds a model link and keeps a lab as one row", () => {
    expect(
      toFollowingEntries([
        lab({ id: 2, name: "Anthropic", labSlug: "anthropic" }),
        model({ id: 1, name: "Claude Haiku 4.5", retired: false }),
      ]),
    ).toEqual([
      { id: 2, kind: "lab", name: "Anthropic", labSlug: "anthropic" },
      {
        id: 1,
        kind: "model",
        name: "Claude Haiku 4.5",
        labName: "Anthropic",
        labSlug: "anthropic",
        modelSlug: "claude-haiku-4.5",
        href: "/models/anthropic/claude-haiku-4.5",
        retired: false,
      },
    ]);
  });

  it("throws when a name or a slug cannot be shown", () => {
    expect(() => toFollowingEntries([lab({ id: 1, name: "  ", labSlug: "anthropic" })])).toThrow(
      /follow name is empty/,
    );
    expect(() => toFollowingEntries([model({ id: 1, modelSlug: "a/b" })])).toThrow(/model slug/);
    expect(() =>
      toFollowingEntries([
        lab({ id: 1, name: "Anthropic", labSlug: "anthropic" }),
        lab({ id: 1, name: "OpenAI", labSlug: "openai" }),
      ]),
    ).toThrow(/share the id/);
  });
});

describe("follow tabs", () => {
  it("counts a filled tab and leaves an empty tab unnamed by a zero", () => {
    expect(followTabLabel("lab", 0)).toBe("Labs");
    expect(followTabLabel("lab", 1)).toBe("1 lab");
    expect(followTabLabel("lab", 2)).toBe("2 labs");
    expect(followTabLabel("model", 0)).toBe("Models");
    expect(followTabLabel("model", 1)).toBe("1 model");
  });

  it("opens Labs when a lab is followed, and Models when only models are", () => {
    expect(initialFollowTab(1, 4)).toBe("labs");
    expect(initialFollowTab(0, 2)).toBe("models");
    expect(initialFollowTab(0, 0)).toBe("labs");
  });
});

function lab(overrides: Partial<Extract<ListedFollow, { kind: "lab" }>>): ListedFollow {
  return {
    id: 1,
    followedAt: WHEN,
    kind: "lab",
    name: "Anthropic",
    labSlug: "anthropic",
    ...overrides,
  };
}

function model(overrides: Partial<Extract<ListedFollow, { kind: "model" }>>): ListedFollow {
  return {
    id: 1,
    followedAt: WHEN,
    kind: "model",
    name: "Claude Haiku 4.5",
    modelSlug: "claude-haiku-4.5",
    labName: "Anthropic",
    labSlug: "anthropic",
    retired: false,
    ...overrides,
  };
}
