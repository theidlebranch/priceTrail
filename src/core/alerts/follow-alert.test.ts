import { describe, expect, it } from "vitest";
import { accountsFollowingPublishedPrice, publishedPriceLine } from "@/core/alerts/follow-alert";
import { eventsFromVisit, priceAlertEvents } from "@/core/alerts/site-alert";

const FOLLOWS = [
  { accountId: "google:model", kind: "model" as const, modelId: 2, labId: null },
  { accountId: "google:lab", kind: "lab" as const, modelId: null, labId: 1 },
  { accountId: "google:both", kind: "model" as const, modelId: 2, labId: null },
  { accountId: "google:both", kind: "lab" as const, modelId: null, labId: 1 },
  { accountId: "github:9", kind: "model" as const, modelId: 8, labId: null },
];

describe("accountsFollowingPublishedPrice", () => {
  it("includes a model follow, a lab follow, and a person who follows both, once", () => {
    expect(accountsFollowingPublishedPrice({ labId: 1, modelId: 2, follows: FOLLOWS })).toEqual([
      "google:model",
      "google:lab",
      "google:both",
    ]);
  });

  it("includes nobody when no follow matches", () => {
    expect(accountsFollowingPublishedPrice({ labId: 4, modelId: 5, follows: FOLLOWS })).toEqual([]);
  });

  it("does not turn a review card or an unreadable page into a follower message", () => {
    expect(priceAlertEvents({ published: false, lab: "anthropic", model: "claude-fable-5-1" })).toEqual(
      [],
    );
    const visit = eventsFromVisit("anthropic", "parser_suspect", [
      { kind: "new_name", modelName: "Claude Example", modelSlug: "claude-example" },
      { kind: "retirement", modelName: "Old", modelSlug: "old" },
      { kind: "gone", modelName: "Missing", modelSlug: "missing" },
    ]);
    expect(visit.some((event) => event.kind === "price_published")).toBe(false);
    expect(publishedPriceLine("anthropic", "claude-fable-5-1")).toBe(
      "Anthropic: claude-fable-5-1 has a new published price.",
    );
  });
});
