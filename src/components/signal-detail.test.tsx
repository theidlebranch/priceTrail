import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { OPENROUTER_COPY, toSignalHistory, toSignalsView } from "@/app/review/signals-view";
import { SignalDetail } from "@/components/signal-detail";
import type { LiteLLMSignalPage, WitnessReadRow } from "@/server/db/repositories/litellm-signals";

const rejectAction = async () => null;

afterEach(() => {
  cleanup();
});
const READ = new Date("2026-11-13T16:30:00.000Z");

describe("SignalDetail", () => {
  it("keeps Approve and Reject on a new name, and a failed run in the history", () => {
    const findings = toSignalsView(page(), OPENROUTER_COPY);
    const history = toSignalHistory(
      [
        read({
          id: 9,
          outcome: "fetch_error",
          note: "download failed",
          agreedCount: null,
          notComparedCount: null,
        }),
      ],
      8,
      null,
    );
    render(<SignalDetail findings={findings} history={history} action={rejectAction} />);

    expect(screen.getByRole("link", { name: "Signals" }).getAttribute("href")).toBe("/review/signals");
    expect(screen.getByRole("heading", { level: 1, name: "OpenRouter" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Approve" }).getAttribute("value")).toBe("approve");
    expect(screen.getByRole("button", { name: "Reject" }).getAttribute("value")).toBe("reject");
    expect(
      screen.getByText(
        "If this name is not on the official pricing page, the next visit for that lab is treated as a broken page until the name appears.",
      ),
    ).toBeTruthy();
    expect(screen.getByRole("heading", { level: 2, name: "Run history" })).toBeTruthy();
    expect(screen.getByText("Could not download")).toBeTruthy();
    expect(screen.getByText("download failed")).toBeTruthy();
    expect(screen.queryByText(/wayback/i)).toBeNull();
  });
});

function page(): LiteLLMSignalPage {
  return {
    latest: { outcome: "ok", fetchedAt: READ, note: "" },
    successful: {
      fetchedAt: READ,
      agreedCount: 0,
      notComparedCount: 0,
      isBaseline: false,
      seenCount: 3,
    },
    disagreements: [],
    candidates: [
      {
        id: 4,
        labName: "Anthropic",
        rawSlug: "claude-new",
        rawName: "claude-new",
        firstSeenAt: READ,
        kind: "new_name",
        hint: null,
      },
    ],
    signals: [],
  };
}

function read(overrides: Partial<WitnessReadRow>): WitnessReadRow {
  return {
    id: 4,
    fetchedAt: READ,
    outcome: "ok",
    note: "",
    agreedCount: 1,
    notComparedCount: 0,
    ...overrides,
  };
}
