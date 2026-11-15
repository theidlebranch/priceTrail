import { describe, expect, it } from "vitest";
import { toSignalsView } from "@/app/review/signals-view";
import type { LiteLLMSignalPage } from "@/server/db/repositories/litellm-signals";

const DETECTED = new Date("2026-11-13T16:30:00.000Z");
const GOOD = new Date("2026-11-13T10:30:00.000Z");

function page(overrides: Partial<LiteLLMSignalPage> = {}): LiteLLMSignalPage {
  return {
    latest: null,
    successful: null,
    disagreements: [],
    candidates: [],
    signals: [],
    ...overrides,
  };
}

describe("toSignalsView", () => {
  it("says the witness has not been read", () => {
    const view = toSignalsView(page());
    expect(view.unread).toBe("LiteLLM has not been read yet.");
    expect(view.latest).toBeNull();
    expect(view.file).toBeNull();
    expect(view.compared).toBeNull();
    expect(view.disagreements).toEqual([]);
  });

  it("keeps the stored amount strings and says the lists are from the last good read", () => {
    const view = toSignalsView(
      page({
        latest: {
          outcome: "fetch_error",
          fetchedAt: DETECTED,
          note: "LiteLLM fetch failed: HTTP 500",
        },
        successful: {
          fetchedAt: GOOD,
          agreedCount: 2,
          notComparedCount: 1,
          isBaseline: false,
          seenCount: 12,
        },
        disagreements: [
          {
            labName: "Anthropic",
            modelName: "Claude Fable 5.1",
            dimension: "input",
            ourValue: "0.10",
            aggregatorValue: "0.20",
            detectedAt: GOOD,
          },
        ],
        signals: [
          {
            labName: "Anthropic",
            modelName: "Claude Mythos 5.1",
            kind: "not_linked",
            hasAlias: true,
            detectedAt: GOOD,
          },
          {
            labName: "OpenAI",
            modelName: "gpt-6-sol",
            kind: "missing",
            hasAlias: false,
            detectedAt: GOOD,
          },
        ],
      }),
    );

    expect(view.latest).toEqual({
      time: "Nov 13 · 16:30 UTC",
      status: "Could not download",
      note: "LiteLLM fetch failed: HTTP 500",
      fromLastGood: "These counts are from the last good read.",
    });
    expect(view.file).toEqual({
      count: 12,
      sentence: "New names are slugs that were not in the previous file.",
    });
    expect(view.compared).toMatchObject({
      agreed: "2 agree",
      notCompared: "1 not compared",
      disagree: "1 disagrees",
    });
    expect(view.emptyDisagreements).toBe("No prices disagree.");
    expect(view.emptyCandidates).toBe("No new names are waiting.");
    expect(view.emptyMissing).toBe("No tracked model is missing.");
    expect(view.emptyNotLinked).toBe("Every tracked model is linked.");
    expect(view.disagreements[0]).toMatchObject({
      ours: "$0.10",
      witness: "$0.20",
      dimension: "Input",
      time: "Nov 13 · 10:30 UTC",
    });
    expect(view.notLinked[0]?.sentence).toBe("The stored witness name is not in this file.");
    expect(view.missing.map((row) => row.model)).toEqual(["OpenAI gpt-6-sol"]);
  });

  it("says a first success creates no new-name cards yet", () => {
    const view = toSignalsView(
      page({
        latest: { outcome: "ok", fetchedAt: GOOD, note: "" },
        successful: {
          fetchedAt: GOOD,
          agreedCount: 1,
          notComparedCount: 0,
          isBaseline: true,
          seenCount: 4,
        },
      }),
    );

    expect(view.latest?.status).toBe("Read held");
    expect(view.latest?.fromLastGood).toBeNull();
    expect(view.file?.sentence).toBe("First read. A new name shows up on the next read.");
    expect(view.compared?.disagree).toBe("0 disagree");
  });

  it("does not claim the lists are healthy when no read has succeeded", () => {
    const view = toSignalsView(
      page({
        latest: {
          outcome: "parse_error",
          fetchedAt: DETECTED,
          note: "LiteLLM parse failed",
        },
      }),
    );

    expect(view.unread).toBeNull();
    expect(view.latest?.status).toBe("Could not parse");
    expect(view.latest?.fromLastGood).toBeNull();
    expect(view.file).toBeNull();
    expect(view.compared).toBeNull();
    expect(view.emptyDisagreements).toBe("Findings are unavailable until a read succeeds.");
    expect(view.emptyCandidates).toBe("Findings are unavailable until a read succeeds.");
    expect(view.emptyMissing).toBe("Findings are unavailable until a read succeeds.");
    expect(view.emptyNotLinked).toBe("Findings are unavailable until a read succeeds.");
  });
});
