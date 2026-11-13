import { describe, expect, it } from "vitest";
import { toSignalsView } from "@/app/review/signals-view";
import type { LiteLLMSignalPage } from "@/server/db/repositories/litellm-signals";

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
    expect(view.disagreements).toEqual([]);
  });

  it("keeps the stored amount strings and the failure sentence", () => {
    const view = toSignalsView(
      page({
        latest: {
          outcome: "fetch_error",
          fetchedAt: new Date("2026-11-13T16:30:00.000Z"),
          note: "LiteLLM fetch failed: HTTP 500",
        },
        successful: {
          fetchedAt: new Date("2026-11-13T10:30:00.000Z"),
          agreedCount: 2,
          notComparedCount: 1,
        },
        disagreements: [
          {
            labName: "Anthropic",
            modelName: "Claude Fable 5.1",
            dimension: "input",
            ourValue: "0.10",
            aggregatorValue: "0.20",
          },
        ],
        signals: [
          {
            labName: "Anthropic",
            modelName: "Claude Mythos 5.1",
            kind: "not_linked",
            hasAlias: true,
          },
          {
            labName: "OpenAI",
            modelName: "gpt-6-sol",
            kind: "missing",
            hasAlias: false,
          },
        ],
      }),
    );

    expect(view.failure).toBe("The latest read failed.");
    expect(view.failureNote).toBe("LiteLLM fetch failed: HTTP 500");
    expect(view.successful).toBe("Last successful read Nov 13 · 10:30 UTC.");
    expect(view.emptyDisagreements).toBe("No prices disagree.");
    expect(view.emptyCandidates).toBe("No new names are waiting.");
    expect(view.emptyMissing).toBe("No tracked model is missing.");
    expect(view.emptyNotLinked).toBe("Every tracked model is linked.");
    expect(view.agreed).toBe("2 models agree.");
    expect(view.notCompared).toBe("1 model was not compared.");
    expect(view.disagreements[0]).toMatchObject({
      ours: "$0.10",
      witness: "$0.20",
      dimension: "Input",
    });
    expect(view.notLinked[0]?.sentence).toBe("The stored witness name is not in this file.");
    expect(view.missing.map((row) => row.model)).toEqual(["OpenAI gpt-6-sol"]);
  });

  it("does not claim the lists are healthy when no read has succeeded", () => {
    const view = toSignalsView(
      page({
        latest: {
          outcome: "parse_error",
          fetchedAt: new Date("2026-11-13T16:30:00.000Z"),
          note: "LiteLLM parse failed",
        },
      }),
    );

    expect(view.unread).toBeNull();
    expect(view.failure).toBe("The latest read failed.");
    expect(view.successful).toBeNull();
    expect(view.emptyDisagreements).toBe("Findings are unavailable until a read succeeds.");
    expect(view.emptyCandidates).toBe("Findings are unavailable until a read succeeds.");
    expect(view.emptyMissing).toBe("Findings are unavailable until a read succeeds.");
    expect(view.emptyNotLinked).toBe("Findings are unavailable until a read succeeds.");
  });
});
