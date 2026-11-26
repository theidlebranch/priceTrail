import { describe, expect, it } from "vitest";
import {
  eventsFromVisit,
  priceAlertEvents,
  siteAlertLines,
  type SiteAlertEvent,
} from "@/core/alerts/site-alert";

describe("siteAlertLines", () => {
  it("names the lab and the event, and uses the known lab names", () => {
    const lines = siteAlertLines([
      { kind: "new_model", lab: "anthropic", model: "Claude Example" },
      { kind: "retirement", lab: "openai", model: "gpt-6-sol" },
      { kind: "gone", lab: "google", model: "Gemini Example" },
      { kind: "parser_suspect", lab: "anthropic" },
      { kind: "price_published", lab: "OpenAI", model: "gpt-6-sol" },
    ]);

    expect(lines).toBe(
      [
        "Anthropic: Claude Example is a new model waiting for review.",
        "OpenAI: gpt-6-sol may be retired and is waiting for review.",
        "Google: Gemini Example is missing from the pricing page and is waiting for review.",
        "Anthropic: the pricing page could not be read.",
        "OpenAI: gpt-6-sol has a new published price.",
      ].join("\n"),
    );
    expect(lines).not.toMatch(/http/i);
    expect(lines.toLowerCase()).not.toContain("webhook");
  });

  it("returns no text when there is nothing to say", () => {
    expect(siteAlertLines([])).toBe("");
  });

  it("refuses a blank lab or a blank model", () => {
    expect(() => siteAlertLines([{ kind: "parser_suspect", lab: "  " }])).toThrow(/alert lab is empty/);
    expect(() =>
      siteAlertLines([{ kind: "new_model", lab: "anthropic", model: "  " }]),
    ).toThrow(/alert model is empty/);
  });
});

describe("eventsFromVisit", () => {
  it("turns a suspect visit and the cards that visit opened into alert events", () => {
    expect(
      eventsFromVisit("anthropic", "parser_suspect", [
        { kind: "new_name", modelName: "Claude Example", modelSlug: "claude-example" },
        { kind: "retirement", modelName: "", modelSlug: "old-model" },
        { kind: "gone", modelName: "Gone Model", modelSlug: "gone-model" },
      ]),
    ).toEqual([
      { kind: "parser_suspect", lab: "anthropic" },
      { kind: "new_model", lab: "anthropic", model: "Claude Example" },
      { kind: "retirement", lab: "anthropic", model: "old-model" },
      { kind: "gone", lab: "anthropic", model: "Gone Model" },
    ] satisfies SiteAlertEvent[]);
  });

  it("says nothing for an unchanged page or a failed download when no card opened", () => {
    expect(eventsFromVisit("openai", "unchanged", [])).toEqual([]);
    expect(eventsFromVisit("openai", "fetch_error", [])).toEqual([]);
  });

  it("skips a card that has no name and no slug", () => {
    expect(
      eventsFromVisit("google", "changed", [
        { kind: "new_name", modelName: "  ", modelSlug: " " },
      ]),
    ).toEqual([]);
  });
});

describe("priceAlertEvents", () => {
  it("builds a price line only when a price was published", () => {
    expect(priceAlertEvents({ published: false, lab: "anthropic", model: "claude-fable-5-1" })).toEqual(
      [],
    );
    expect(siteAlertLines(priceAlertEvents({ published: false, lab: "anthropic", model: "x" }))).toBe(
      "",
    );
    expect(priceAlertEvents({ published: true, lab: "google", model: "gemini-2.5-pro" })).toEqual([
      { kind: "price_published", lab: "google", model: "gemini-2.5-pro" },
    ]);
  });
});
