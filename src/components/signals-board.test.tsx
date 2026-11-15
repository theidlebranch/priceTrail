import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { toSignalBoardView, toSignalsView } from "@/app/review/signals-view";
import { SignalJobBoard, SignalsBoard } from "@/components/signals-board";
import { SIGNAL_JOB_URLS, type LiteLLMSignalPage, type SignalJobRow } from "@/server/db/repositories/litellm-signals";

const rejectAction = async () => null;

afterEach(() => {
  cleanup();
});

const READ = new Date("2026-11-13T16:30:00.000Z");

describe("SignalsBoard", () => {
  it("shows the unread sentence before any read", () => {
    const page: LiteLLMSignalPage = {
      latest: null,
      successful: null,
      disagreements: [],
      candidates: [],
      signals: [],
    };
    render(<SignalsBoard view={toSignalsView(page)} rejectAction={rejectAction} />);
    expect(screen.getByRole("heading", { level: 2, name: "LiteLLM" })).toBeTruthy();
    expect(screen.getByText("LiteLLM has not been read yet.")).toBeTruthy();
    expect(screen.getByText(/It cannot publish a price/)).toBeTruthy();
  });

  it("shows a disagreement amount without shortening it", () => {
    const page: LiteLLMSignalPage = {
      latest: { outcome: "ok", fetchedAt: READ, note: "" },
      successful: {
        fetchedAt: READ,
        agreedCount: 1,
        notComparedCount: 0,
        isBaseline: true,
        seenCount: 8,
      },
      disagreements: [
        {
          labName: "Anthropic",
          modelName: "Claude Fable 5.1",
          dimension: "input",
          ourValue: "0.10",
          aggregatorValue: "0.20",
          detectedAt: READ,
        },
      ],
      candidates: [],
      signals: [],
    };
    render(<SignalsBoard view={toSignalsView(page)} rejectAction={rejectAction} />);
    expect(screen.getByRole("heading", { level: 3, name: "Latest read" })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 3, name: "Disagreements" })).toBeTruthy();
    expect(screen.getByText("Read held")).toBeTruthy();
    expect(screen.getByText("8")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 3, name: "Names in the file" }).getAttribute("title")).toBe(
      "First read. A new name shows up on the next read.",
    );
    expect(screen.getByRole("heading", { level: 3, name: "Compared" }).getAttribute("title")).toMatch(
      /Agree is a linked model/,
    );
    expect(screen.getByText("1 agrees")).toBeTruthy();
    expect(screen.getByText(/ours \$0\.10, witness \$0\.20/)).toBeTruthy();
    expect(screen.getByText("No new names are waiting.")).toBeTruthy();
    expect(screen.getAllByText("Nov 13 · 16:30 UTC").length).toBeGreaterThan(0);
  });
});

describe("SignalJobBoard", () => {
  it("links a stored job and leaves an unread job as text", () => {
    const view = toSignalBoardView([
      job(SIGNAL_JOB_URLS[0]),
      job(SIGNAL_JOB_URLS[1], {
        sourceId: 8,
        latest: {
          outcome: "fetch_error",
          fetchedAt: READ,
          note: "OpenRouter fetch failed",
        },
        hasSuccessfulRead: true,
        disagreementCount: 1,
        newNameCount: 2,
        missingCount: 0,
      }),
    ]);
    render(<SignalJobBoard view={view} />);

    const list = screen.getByRole("list");
    expect(within(list).queryByRole("link", { name: /LiteLLM/ })).toBeNull();
    expect(within(list).getByText("LiteLLM has not been read yet.")).toBeTruthy();
    const openrouter = within(list).getByRole("link", { name: /OpenRouter/ });
    expect(openrouter.getAttribute("href")).toBe("/review/signals/8");
    expect(openrouter.closest("li")?.className).toMatch(/border-l-status-warning/);
    expect(screen.getByText("1 disagreement. 2 new names. 0 missing models.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Reject" })).toBeNull();
    expect(screen.queryByText(/wayback/i)).toBeNull();
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
