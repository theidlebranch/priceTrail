import { describe, expect, it } from "vitest";
import { OPENROUTER_COPY, toSignalBoardView, toSignalHistory, toSignalsView } from "@/app/review/signals-view";
import {
  SIGNAL_JOB_URLS,
  WITNESS_READ_PAGE_SIZE,
  type LiteLLMSignalPage,
  type SignalJobRow,
  type WitnessReadRow,
} from "@/server/db/repositories/litellm-signals";

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
    expect(view.title).toBe("LiteLLM");
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

  it("names OpenRouter on its own section and keeps a display name", () => {
    const view = toSignalsView(
      page({
        candidates: [
          {
            id: 4,
            labName: "Anthropic",
            rawSlug: "claude-new",
            rawName: "Anthropic: Claude New",
            firstSeenAt: GOOD,
          },
        ],
      }),
      OPENROUTER_COPY,
    );

    expect(view.title).toBe("OpenRouter");
    expect(view.unread).toBe("OpenRouter has not been read yet.");
    expect(view.description).toMatch(/cannot publish a price/);
    expect(view.candidates).toEqual([
      { id: 4, label: "Anthropic: Claude New (claude-new)", time: "Nov 13 · 10:30 UTC" },
    ]);
  });
});

describe("toSignalBoardView", () => {
  it("lists LiteLLM before OpenRouter, and an unread job has no link or counts", () => {
    const view = toSignalBoardView([
      job(SIGNAL_JOB_URLS[1]),
      job(SIGNAL_JOB_URLS[0]),
    ]);

    expect(view.entries.map((entry) => entry.title)).toEqual(["LiteLLM", "OpenRouter"]);
    expect(view.entries[0]).toMatchObject({
      href: null,
      lastRun: null,
      status: "LiteLLM has not been read yet.",
      failed: false,
      disagreements: null,
      newNames: null,
      missing: null,
    });
    expect(JSON.stringify(view)).not.toMatch(/wayback|archive/i);
  });

  it("keeps a failed first read from looking like zero disagreements", () => {
    const view = toSignalBoardView(
      bothJobs({
        openrouter: {
          sourceId: 8,
          latest: {
            outcome: "parse_error",
            fetchedAt: DETECTED,
            note: "OpenRouter parse failed",
          },
        },
      }),
    );
    const openrouter = view.entries[1];

    expect(openrouter).toMatchObject({
      href: "/review/signals/8",
      lastRun: "Nov 13 · 16:30 UTC",
      status: "Could not parse",
      note: "OpenRouter parse failed",
      failed: true,
      fromLastGood: null,
      disagreements: null,
      newNames: null,
      missing: null,
    });
  });

  it("keeps the last good counts when a later read fails", () => {
    const view = toSignalBoardView(
      bothJobs({
        litellm: {
          sourceId: 3,
          latest: {
            outcome: "fetch_error",
            fetchedAt: DETECTED,
            note: "LiteLLM fetch failed: HTTP 500",
          },
          hasSuccessfulRead: true,
          disagreementCount: 1,
          newNameCount: 2,
          missingCount: 0,
        },
      }),
    );

    expect(view.entries[0]).toMatchObject({
      href: "/review/signals/3",
      status: "Could not download",
      failed: true,
      fromLastGood: "These counts are from the last good read.",
      disagreements: "1 disagreement",
      newNames: "2 new names",
      missing: "0 missing models",
    });
  });

  it("shows a real zero after a read that found no disagreements", () => {
    const view = toSignalBoardView(
      bothJobs({
        litellm: {
          sourceId: 3,
          latest: { outcome: "ok", fetchedAt: GOOD, note: "" },
          hasSuccessfulRead: true,
          disagreementCount: 0,
          newNameCount: 0,
          missingCount: 0,
        },
      }),
    );

    expect(view.entries[0]).toMatchObject({
      status: "Read held",
      failed: false,
      fromLastGood: null,
      disagreements: "0 disagreements",
      newNames: "0 new names",
      missing: "0 missing models",
    });
  });

  it("throws when one of the two jobs is missing", () => {
    expect(() => toSignalBoardView([job(SIGNAL_JOB_URLS[0])])).toThrow(/LiteLLM and OpenRouter/);
  });
});

describe("toSignalHistory", () => {
  it("keeps a failed run on the list and shows the stored counts for a good run", () => {
    const view = toSignalHistory(
      [
        read({ id: 9, outcome: "fetch_error", note: "download failed", agreedCount: null, notComparedCount: null }),
        read({ id: 4, outcome: "ok", note: "", agreedCount: 2, notComparedCount: 1, fetchedAt: GOOD }),
      ],
      3,
      null,
    );

    expect(view.empty).toBeNull();
    expect(view.olderHref).toBeNull();
    expect(view.rows[0]).toMatchObject({
      status: "Could not download",
      note: "download failed",
      counts: null,
      failed: true,
    });
    expect(view.rows[1]).toMatchObject({
      status: "Read held",
      counts: "2 agree, 1 not compared",
      failed: false,
    });
    expect(JSON.stringify(view)).not.toMatch(/wayback|archive/i);
  });

  it("links to the older page from the last row on a full page", () => {
    const oldest = new Date("2026-11-01T00:00:00.000Z");
    const rows = Array.from({ length: WITNESS_READ_PAGE_SIZE }, (_, index) =>
      read({
        id: WITNESS_READ_PAGE_SIZE - index,
        fetchedAt: new Date(oldest.getTime() + (WITNESS_READ_PAGE_SIZE - index) * 60_000),
      }),
    );
    rows[rows.length - 1] = read({ id: 1, fetchedAt: oldest });
    const view = toSignalHistory(rows, 6, null);

    expect(view.olderHref).toBe(
      `/review/signals/6?before=${encodeURIComponent(oldest.toISOString())}&beforeId=1`,
    );
  });

  it("says there is nothing older when the next page is empty", () => {
    const view = toSignalHistory([], 6, { fetchedAt: GOOD, id: 1 });
    expect(view.empty).toBe("No older reads.");
    expect(view.olderHref).toBeNull();
  });

  it("throws when a successful row has no counts", () => {
    expect(() =>
      toSignalHistory(
        [read({ agreedCount: null, notComparedCount: null })],
        3,
        null,
      ),
    ).toThrow(/missing its counts/);
  });
});

function job(url: string, overrides: Partial<SignalJobRow> = {}): SignalJobRow {
  return {
    url,
    sourceId: null,
    latest: null,
    hasSuccessfulRead: false,
    disagreementCount: null,
    newNameCount: null,
    missingCount: null,
    ...overrides,
  };
}

function bothJobs(overrides: {
  litellm?: Partial<SignalJobRow>;
  openrouter?: Partial<SignalJobRow>;
}): SignalJobRow[] {
  return [job(SIGNAL_JOB_URLS[0], overrides.litellm), job(SIGNAL_JOB_URLS[1], overrides.openrouter)];
}

function read(overrides: Partial<WitnessReadRow> = {}): WitnessReadRow {
  return {
    id: 4,
    fetchedAt: DETECTED,
    outcome: "ok",
    note: "",
    agreedCount: 1,
    notComparedCount: 0,
    ...overrides,
  };
}
