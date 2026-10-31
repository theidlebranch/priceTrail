import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ModelDetail } from "@/components/model-detail";
import type { ModelDetailView } from "@/app/models/model-detail-view";

afterEach(() => {
  cleanup();
});

const SOURCE = "https://platform.claude.com/docs/en/about-claude/pricing.md";

function view(overrides: Partial<ModelDetailView> = {}): ModelDetailView {
  return {
    labName: "Anthropic",
    modelName: "Claude Fable 5.1",
    retired: false,
    price: {
      dateLine: "Changed on or before 2026-10-18.",
      sourceUrl: SOURCE,
      sourceLabel: "Official pricing page",
      components: [
        { dimensionLabel: "Input", amountText: "$10", conditionLabel: "" },
        { dimensionLabel: "Output", amountText: "$50", conditionLabel: "" },
        { dimensionLabel: "Cache read", amountText: "$0.25", conditionLabel: "" },
        { dimensionLabel: "Cache write (5 minutes)", amountText: "$12.5", conditionLabel: "" },
        { dimensionLabel: "Cache write (1 hour)", amountText: "$20", conditionLabel: "" },
      ],
    },
    ...overrides,
  };
}

describe("ModelDetail", () => {
  it("shows the current components, the date line, and the official page", () => {
    render(<ModelDetail view={view()} />);

    expect(screen.getByRole("heading", { name: "Claude Fable 5.1" })).toBeTruthy();
    expect(screen.getByText("Anthropic")).toBeTruthy();
    expect(screen.getByText("Changed on or before 2026-10-18.")).toBeTruthy();
    expect(screen.getByText("Input")).toBeTruthy();
    expect(screen.getByText("$10")).toBeTruthy();
    expect(screen.getByText("$12.5")).toBeTruthy();
    expect(screen.getByText("Cache write (5 minutes)")).toBeTruthy();
    expect(screen.getAllByText("/ 1M tokens")).toHaveLength(5);

    const link = screen.getByRole("link", { name: "Official pricing page" });
    expect(link.getAttribute("href")).toBe(SOURCE);
    expect(screen.queryByText("Retired")).toBeNull();
    expect(screen.queryByText("All prices shown on this page are examples.")).toBeNull();
    expect(screen.queryByText("No current price is published.")).toBeNull();
  });

  it("shows a tier next to the amount it belongs to", () => {
    render(
      <ModelDetail
        view={view({
          price: {
            dateLine: "Changed on or before 2026-10-18.",
            sourceUrl: SOURCE,
            sourceLabel: "Official pricing page",
            components: [
              {
                dimensionLabel: "Input",
                amountText: "$0.50",
                conditionLabel: "prompts up to 100,000 tokens",
              },
            ],
          },
        })}
      />,
    );

    expect(screen.getByText("prompts up to 100,000 tokens")).toBeTruthy();
    expect(screen.getByText("$0.50")).toBeTruthy();
  });

  it("shows Retired and still shows the price", () => {
    render(<ModelDetail view={view({ retired: true })} />);

    expect(screen.getByText("Retired")).toBeTruthy();
    expect(screen.getByText("$10")).toBeTruthy();
  });

  it("shows an empty price without a table or an official link", () => {
    render(<ModelDetail view={view({ price: null })} />);

    expect(screen.getByText("No current price is published.")).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.queryByRole("link", { name: "Official pricing page" })).toBeNull();
    expect(screen.queryByText("All prices shown on this page are examples.")).toBeNull();
  });
});
