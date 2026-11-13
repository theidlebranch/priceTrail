import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { ModelDetailView } from "@/app/models/model-detail-view";
import { ModelDetail } from "@/components/model-detail";

afterEach(() => {
  cleanup();
});

const SOURCE = "https://platform.claude.com/docs/en/about-claude/pricing.md";
const ARCHIVE = `https://web.archive.org/web/20261018233000/${SOURCE}`;
const MISSING_PROOF = { kind: "missing" as const, text: "No archived snapshot." as const };

const HISTORY: ModelDetailView["history"] = {
  series: [
    {
      id: "input",
      dimension: "input",
      label: "Input",
      note: null,
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
      id: "output",
      dimension: "output",
      label: "Output",
      note: null,
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
  bounds: [],
  notes: [],
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
  const next: ModelDetailView = {
    labName: "Anthropic",
    modelName: "Claude Fable 5.1",
    retired: false,
    versionCount: 1,
    sinceDay: "2026-10-18",
    headlines: [
      { label: "Input", amountText: "$10", change: null },
      { label: "Output", amountText: "$50", change: null },
    ],
    tiers: [],
    events: [],
    startingPrice: null,
    history: HISTORY,
    changeUnderReview: false,
    price: {
      dateLine: "Changed on or before 2026-10-18.",
      sourceUrl: SOURCE,
      sourceLabel: "Official pricing page",
      proof: MISSING_PROOF,
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
  if (overrides.tiers === undefined) {
    next.tiers = [
      {
        label: null,
        headlines: next.headlines,
        rows: next.price?.components ?? [],
        series: next.history.series,
      },
    ];
  }
  return next;
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
    expect(screen.queryByRole("tablist", { name: "Context tier" })).toBeNull();
    expect(screen.queryByText("↓")).toBeNull();
    expect(screen.queryByText("Retired")).toBeNull();

    const link = screen.getByRole("link", { name: "Official pricing page" });
    expect(link.getAttribute("href")).toBe(SOURCE);
    expect(screen.getByText("No archived snapshot.")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Archived snapshot" })).toBeNull();
    expect(screen.queryByText("All prices shown on this page are examples.")).toBeNull();
    expect(screen.queryByText("No current price is published.")).toBeNull();
    expect(screen.queryByText("A possible change is under review.")).toBeNull();
  });

  it("shows one context tier at a time and keeps the change log whole", () => {
    const shortSeries = {
      id: "input",
      dimension: "input" as const,
      label: "Input",
      note: null,
      latestAmountText: "2",
      changeCount: 0,
      segments: [
        {
          kind: "known" as const,
          from: "2026-10-18",
          to: "2026-11-05",
          amountText: "2",
          amount: 2,
          label: "Changed on or before 2026-10-18.",
        },
      ],
    };
    const longSeries = {
      ...shortSeries,
      id: "input:longContext",
      latestAmountText: "4",
      segments: [
        {
          ...shortSeries.segments[0],
          amountText: "4",
          amount: 4,
        },
      ],
    };

    render(
      <ModelDetail
        view={view({
          headlines: [{ label: "Input", amountText: "$2", change: null }],
          tiers: [
            {
              label: "Up to 272,000 tokens",
              headlines: [{ label: "Input", amountText: "$2", change: null }],
              rows: [row("Input", "$2"), row("Output", "$12", "", "6×")],
              series: [shortSeries],
            },
            {
              label: "Over 272,000 tokens",
              headlines: [{ label: "Input", amountText: "$4", change: null }],
              rows: [row("Input", "$4"), row("Output", "$18", "", "4.5×")],
              series: [longSeries],
            },
          ],
          events: [
            {
              dateLine: "Changed on or before 2026-10-18.",
              proof: MISSING_PROOF,
              changes: [
                {
                  dimensionLabel: "Input",
                  conditionLabel: "≤272K",
                  fromAmountText: "$1",
                  toAmountText: "$2",
                  direction: "up",
                  pctText: "100",
                },
                {
                  dimensionLabel: "Input",
                  conditionLabel: ">272K",
                  fromAmountText: "$3",
                  toAmountText: "$4",
                  direction: "up",
                  pctText: "33.33",
                },
              ],
            },
          ],
        })}
      />,
    );

    expect(screen.getByRole("tab", { name: "Up to 272,000 tokens", selected: true })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Over 272,000 tokens", selected: false })).toBeTruthy();
    expect(screen.getAllByText("$2").length).toBeGreaterThan(0);
    expect(screen.getByText("$12")).toBeTruthy();
    expect(screen.queryByText("$4")).toBeNull();
    expect(screen.queryByText("$18")).toBeNull();
    expect(screen.getByRole("table", { name: "Input price history" }).textContent).toContain("$2");

    fireEvent.click(screen.getByRole("tab", { name: "Over 272,000 tokens" }));

    expect(screen.getByRole("tab", { name: "Over 272,000 tokens", selected: true })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Up to 272,000 tokens", selected: false })).toBeTruthy();
    expect(screen.getAllByText("$4").length).toBeGreaterThan(0);
    expect(screen.getByText("$18")).toBeTruthy();
    expect(screen.queryByText("$2")).toBeNull();
    expect(screen.queryByText("$12")).toBeNull();
    expect(screen.getByRole("table", { name: "Input price history" }).textContent).toContain("$4");

    const log = screen.getByRole("heading", { name: "Change log" }).closest("section");
    expect(log?.textContent).toContain("≤272K");
    expect(log?.textContent).toContain(">272K");
    expect(log?.textContent).toContain("$1 → $2");
    expect(log?.textContent).toContain("$3 → $4");
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
            proof: MISSING_PROOF,
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
              proof: MISSING_PROOF,
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
            proof: { kind: "link", url: ARCHIVE, text: "Archived snapshot" },
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
    const snapshots = screen.getAllByRole("link", { name: "Archived snapshot" });
    expect(snapshots.map((link) => link.getAttribute("href"))).toEqual([ARCHIVE]);
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
              proof: MISSING_PROOF,
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

  it("shows the opening snapshot on a change and on the starting price", () => {
    render(
      <ModelDetail
        view={view({
          versionCount: 2,
          events: [
            {
              dateLine: "Changed on or before 2026-10-18.",
              proof: { kind: "link", url: ARCHIVE, text: "Archived snapshot" },
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
          startingPrice: {
            dateLine: "Changed on or before 2026-01-15.",
            proof: { kind: "missing", text: "No archived snapshot." },
          },
          price: {
            dateLine: "Changed on or before 2026-10-18.",
            sourceUrl: SOURCE,
            sourceLabel: "Official pricing page",
            proof: { kind: "link", url: ARCHIVE, text: "Archived snapshot" },
            components: [row("Input", "$10")],
          },
        })}
      />,
    );

    const log = screen.getByRole("heading", { name: "Change log" }).closest("section");
    expect(log?.textContent).toContain("Starting price");
    expect(log?.textContent).toContain("Changed on or before 2026-01-15.");
    expect(log?.textContent).toContain("No archived snapshot.");
    const snapshots = screen.getAllByRole("link", { name: "Archived snapshot" });
    expect(snapshots.map((link) => link.getAttribute("href"))).toEqual([ARCHIVE, ARCHIVE]);
    expect(screen.getByRole("link", { name: "Official pricing page" }).getAttribute("href")).toBe(
      SOURCE,
    );
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
            proof: MISSING_PROOF,
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
            bounds: [],
            notes: [],
          },
        })}
      />,
    );

    expect(screen.getByText("Input has a tier, so it is not on this chart.")).toBeTruthy();
    expect(screen.queryByText("No price history is published.")).toBeNull();
    expect(screen.queryByRole("tab")).toBeNull();
  });

  it("shows a known token bound under the chart", () => {
    render(
      <ModelDetail
        view={view({
          history: {
            ...HISTORY,
            notes: [
              "Input also has a price for prompts up to 100,000 tokens, $0.50. It is not on this chart.",
            ],
          },
        })}
      />,
    );

    expect(
      screen.getByText(
        "Input also has a price for prompts up to 100,000 tokens, $0.50. It is not on this chart.",
      ),
    ).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Input" })).toBeTruthy();
  });

  it("shows an empty price without rows, a chart, or an official link", () => {
    render(
      <ModelDetail
        view={view({
          price: null,
          headlines: [],
          history: { series: [], skipped: [], bounds: [], notes: [] },
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

  it("shows the review banner and keeps the published price", () => {
    render(<ModelDetail view={view({ changeUnderReview: true })} />);

    expect(screen.getByRole("status").textContent).toBe("A possible change is under review.");
    expect(screen.getAllByText("$10").length).toBeGreaterThan(0);
    expect(screen.queryByText("999")).toBeNull();
  });
});
