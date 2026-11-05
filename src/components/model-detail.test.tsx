import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { ModelDetailView } from "@/app/models/model-detail-view";
import { ModelDetail } from "@/components/model-detail";

afterEach(() => {
  cleanup();
});

const SOURCE = "https://platform.claude.com/docs/en/about-claude/pricing.md";

const HISTORY: ModelDetailView["history"] = {
  series: [
    {
      dimension: "input",
      label: "Input",
      latestAmountText: "10",
      changeCount: 0,
      segments: [
        {
          kind: "known",
          from: "2026-10-18",
          to: "2026-11-05",
          amountText: "10",
          amount: 10,
          label: "Changed on or before 2026-10-18.",
        },
      ],
    },
    {
      dimension: "output",
      label: "Output",
      latestAmountText: "50",
      changeCount: 0,
      segments: [
        {
          kind: "known",
          from: "2026-10-18",
          to: "2026-11-05",
          amountText: "50",
          amount: 50,
          label: "Changed on or before 2026-10-18.",
        },
      ],
    },
  ],
  skipped: [],
};

function row(
  dimensionLabel: string,
  amountText: string,
  conditionLabel = "",
  multiplierText: string | null = null,
  lastChange: NonNullable<ModelDetailView["price"]>["components"][number]["lastChange"] = null,
): NonNullable<ModelDetailView["price"]>["components"][number] {
  return {
    dimensionLabel,
    amountText,
    conditionLabel,
    multiplierText,
    lastChange,
  };
}

function view(overrides: Partial<ModelDetailView> = {}): ModelDetailView {
  return {
    labName: "Anthropic",
    modelName: "Claude Fable 5.1",
    retired: false,
    versionCount: 1,
    sinceDay: "2026-10-18",
    headlines: [
      { label: "Input", amountText: "$10", change: null },
      { label: "Output", amountText: "$50", change: null },
    ],
    events: [],
    history: HISTORY,
    price: {
      dateLine: "Changed on or before 2026-10-18.",
      sourceUrl: SOURCE,
      sourceLabel: "Official pricing page",
      components: [
        row("Input", "$10"),
        row("Cache read", "$0.25", "", "0.025×"),
        row("Output", "$50", "", "5×"),
        row("Cache write (5 minutes)", "$12.5", "", "1.25×"),
        row("Cache write (1 hour)", "$20", "", "2×"),
      ],
    },
    ...overrides,
  };
}

describe("ModelDetail", () => {
  it("shows the current prices, the date line, and the official page", () => {
    render(<ModelDetail view={view()} />);

    expect(screen.getByRole("heading", { name: "Claude Fable 5.1" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Models" }).getAttribute("href")).toBe("/models");
    expect(screen.getByText("1 price version since 2026-10-18")).toBeTruthy();
    expect(screen.getAllByText("Changed on or before 2026-10-18.").length).toBeGreaterThan(0);
    expect(screen.getAllByText("$10").length).toBeGreaterThan(0);
    expect(screen.getAllByText("$50").length).toBeGreaterThan(0);
    expect(screen.getByText("5×")).toBeTruthy();
    expect(screen.getByText("0.025×")).toBeTruthy();
    expect(screen.getByText("No price changes since 2026-10-18.")).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Input", selected: true })).toBeTruthy();
    expect(screen.queryByText("↓")).toBeNull();
    expect(screen.queryByText("Retired")).toBeNull();

    const link = screen.getByRole("link", { name: "Official pricing page" });
    expect(link.getAttribute("href")).toBe(SOURCE);
    expect(screen.queryByText("All prices shown on this page are examples.")).toBeNull();
    expect(screen.queryByText("No current price is published.")).toBeNull();
  });

  it("renders component rows in the order the view gave them", () => {
    render(
      <ModelDetail
        view={view({
          headlines: [],
          price: {
            dateLine: "Changed on or before 2026-10-18.",
            sourceUrl: SOURCE,
            sourceLabel: "Official pricing page",
            components: [
              row("Cache write (5 minutes)", "$1.25", "prompts over 200,000 tokens"),
              row("Cache write (5 minutes)", "$1.00", "prompts up to 200,000 tokens"),
              row("Cache write (1 hour)", "$2"),
            ],
          },
        })}
      />,
    );

    const section = screen.getByRole("heading", { name: "Price components" }).closest("section");
    expect(section?.textContent).toMatch(
      /Cache write \(5 minutes\)[\s\S]*prompts over 200,000 tokens[\s\S]*\$1\.25[\s\S]*Cache write \(5 minutes\)[\s\S]*prompts up to 200,000 tokens[\s\S]*\$1\.00[\s\S]*Cache write \(1 hour\)[\s\S]*\$2/,
    );
  });

  it("shows one changed component with a down badge", () => {
    render(
      <ModelDetail
        view={view({
          versionCount: 2,
          sinceDay: "2026-01-15",
          headlines: [
            {
              label: "Input",
              amountText: "$10",
              change: {
                direction: "down",
                pctText: "33.33",
                previousAmountText: "$15",
                previousDateLine: "Changed on or before 2026-01-15.",
              },
            },
            { label: "Output", amountText: "$50", change: null },
          ],
          events: [
            {
              dateLine: "Changed on or before 2026-10-18.",
              changes: [
                {
                  dimensionLabel: "Input",
                  conditionLabel: "",
                  fromAmountText: "$15",
                  toAmountText: "$10",
                  direction: "down",
                  pctText: "33.33",
                },
              ],
            },
          ],
          price: {
            dateLine: "Changed on or before 2026-10-18.",
            sourceUrl: SOURCE,
            sourceLabel: "Official pricing page",
            components: [
              row("Input", "$10", "", null, {
                direction: "down",
                pctText: "33.33",
                dateLine: "Changed on or before 2026-10-18.",
              }),
              row("Output", "$50", "", "5×"),
            ],
          },
        })}
      />,
    );

    expect(screen.getAllByText("↓ 33.33%").length).toBeGreaterThan(0);
    expect(
      screen.getByText("was $15 · Changed on or before 2026-01-15."),
    ).toBeTruthy();
    expect(screen.getByText("2 price versions since 2026-01-15")).toBeTruthy();
    expect(screen.getByText("1 component changed")).toBeTruthy();
    expect(screen.getByText("$15 → $10")).toBeTruthy();
    expect(screen.queryByText("No price changes since 2026-01-15.")).toBeNull();
  });

  it("keeps several component changes inside one log event", () => {
    render(
      <ModelDetail
        view={view({
          events: [
            {
              dateLine: "Changed on or before 2026-10-18.",
              changes: [
                {
                  dimensionLabel: "Input",
                  conditionLabel: "",
                  fromAmountText: "$10",
                  toAmountText: "$15",
                  direction: "up",
                  pctText: "50",
                },
                {
                  dimensionLabel: "Output",
                  conditionLabel: "",
                  fromAmountText: "$50",
                  toAmountText: "$40",
                  direction: "down",
                  pctText: "20",
                },
              ],
            },
          ],
        })}
      />,
    );

    const log = screen.getByRole("heading", { name: "Change log" }).closest("section");
    expect(log?.textContent).toContain("2 components changed");
    expect(log?.textContent).toContain("↑ 50%");
    expect(log?.textContent).toContain("↓ 20%");
    expect(log?.textContent).toContain("$10 → $15");
    expect(log?.textContent).toContain("$50 → $40");
  });

  it("shows a tier next to the amount it belongs to", () => {
    render(
      <ModelDetail
        view={view({
          headlines: [],
          price: {
            dateLine: "Changed on or before 2026-10-18.",
            sourceUrl: SOURCE,
            sourceLabel: "Official pricing page",
            components: [row("Input", "$0.50", "prompts up to 100,000 tokens", "0.5×")],
          },
        })}
      />,
    );

    expect(screen.getByText("prompts up to 100,000 tokens")).toBeTruthy();
    expect(screen.getByText("$0.50")).toBeTruthy();
    expect(screen.getByText("0.5×")).toBeTruthy();
  });

  it("shows Retired and still shows the price", () => {
    render(<ModelDetail view={view({ retired: true })} />);

    expect(screen.getByText("Retired")).toBeTruthy();
    expect(screen.getAllByText("$10").length).toBeGreaterThan(0);
  });

  it("says when a tier is left off the chart", () => {
    render(
      <ModelDetail
        view={view({
          history: {
            series: [],
            skipped: [{ dimension: "input", label: "Input" }],
          },
        })}
      />,
    );

    expect(screen.getByText("Input has a tier, so it is not on this chart.")).toBeTruthy();
    expect(screen.queryByText("No price history is published.")).toBeNull();
    expect(screen.queryByRole("tab")).toBeNull();
  });

  it("shows an empty price without rows, a chart, or an official link", () => {
    render(
      <ModelDetail
        view={view({
          price: null,
          headlines: [],
          history: { series: [], skipped: [] },
          versionCount: 0,
          sinceDay: null,
          events: [],
        })}
      />,
    );

    expect(screen.getByText("No current price is published.")).toBeTruthy();
    expect(screen.getByText("No price history is published.")).toBeTruthy();
    expect(screen.getByText("No price changes are published.")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Price components" })).toBeNull();
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.queryByRole("link", { name: "Official pricing page" })).toBeNull();
    expect(screen.queryByText("All prices shown on this page are examples.")).toBeNull();
  });
});
