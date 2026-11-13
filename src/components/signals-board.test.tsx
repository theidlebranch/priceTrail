import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { toSignalsView } from "@/app/review/signals-view";
import { SignalsBoard } from "@/components/signals-board";

const rejectAction = async () => null;
import type { LiteLLMSignalPage } from "@/server/db/repositories/litellm-signals";

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
  });

  it("shows a disagreement amount without shortening it", () => {
    const page: LiteLLMSignalPage = {
      latest: {
        outcome: "ok",
        fetchedAt: new Date("2026-11-13T16:30:00.000Z"),
        note: "",
      },
      successful: {
        fetchedAt: new Date("2026-11-13T16:30:00.000Z"),
        agreedCount: 1,
        notComparedCount: 0,
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
      candidates: [],
      signals: [],
    };
    render(<SignalsBoard view={toSignalsView(page)} rejectAction={rejectAction} />);
    expect(screen.getByText("1 model agrees.")).toBeTruthy();
    expect(screen.getByText(/ours \$0\.10, witness \$0\.20/)).toBeTruthy();
    expect(screen.getByText("No new names are waiting.")).toBeTruthy();
  });
});
