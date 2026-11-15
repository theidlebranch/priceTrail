import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { toSignalsView } from "@/app/review/signals-view";
import { SignalsBoard } from "@/components/signals-board";

const rejectAction = async () => null;
import type { LiteLLMSignalPage } from "@/server/db/repositories/litellm-signals";

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
    expect(screen.getByRole("heading", { name: "Signals" })).toBeTruthy();
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
    expect(screen.getByRole("heading", { name: "Latest read" })).toBeTruthy();
    expect(screen.getByText("Read held")).toBeTruthy();
    expect(screen.getByText("8")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Names in the file" }).getAttribute("title")).toBe(
      "First read. A new name shows up on the next read.",
    );
    expect(screen.getByRole("heading", { name: "Compared" }).getAttribute("title")).toMatch(
      /Agree is a linked model/,
    );
    expect(screen.getByText("1 agrees")).toBeTruthy();
    expect(screen.getByText(/ours \$0\.10, witness \$0\.20/)).toBeTruthy();
    expect(screen.getByText("No new names are waiting.")).toBeTruthy();
    expect(screen.getAllByText("Nov 13 · 16:30 UTC").length).toBeGreaterThan(0);
  });
});
