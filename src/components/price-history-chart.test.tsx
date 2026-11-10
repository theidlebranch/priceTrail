import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PriceHistoryChart, shortUtcDay } from "@/components/price-history-chart";
import type { PriceHistorySeries } from "@/core/pricing/price-history";

function series(
  dimension: PriceHistorySeries["dimension"],
  label: string,
  changeCount: number,
  amountText: string,
  from: string,
  id: string = dimension,
  note: string | null = null,
): PriceHistorySeries {
  return {
    id,
    dimension,
    label,
    note,
    latestAmountText: amountText,
    changeCount,
    segments: [
      {
        kind: "known",
        from,
        to: "2026-11-05",
        amountText,
        amount: Number(amountText),
        label: `Changed on or before ${from}.`,
      },
    ],
  };
}

afterEach(() => {
  cleanup();
});

describe("PriceHistoryChart", () => {
  it("shows one chart at a time and says when that price has not changed", () => {
    render(
      <PriceHistoryChart
        series={[
          series("input", "Input", 0, "10", "2026-10-18"),
          series("output", "Output", 1, "50", "2026-06-02"),
        ]}
      />,
    );

    expect(screen.getByRole("tab", { name: "Input", selected: true })).toBeTruthy();
    expect(screen.getByText("0 changes · Input")).toBeTruthy();
    expect(screen.getByText("No changes since 2026-10-18.")).toBeTruthy();
    expect(screen.getAllByText("Changed on or before 2026-10-18.")).toHaveLength(2);
    expect(screen.getByText("Solid line: a price we saw")).toBeTruthy();
    expect(screen.getByText("Dashed line: a gap between checks")).toBeTruthy();
    expect(screen.getByRole("img", { name: "Input price history" })).toBeTruthy();
    expect(screen.getByRole("table", { name: "Input price history" }).textContent).toContain("$10");
    expect(screen.queryByText("Changed on or before 2026-06-02.")).toBeNull();

    fireEvent.click(screen.getByRole("tab", { name: "Output" }));

    expect(screen.getByRole("tab", { name: "Output", selected: true })).toBeTruthy();
    expect(screen.getByText("1 change · Output")).toBeTruthy();
    expect(screen.getAllByText("Changed on or before 2026-06-02.")).toHaveLength(2);
    expect(screen.queryByText("No changes since 2026-10-18.")).toBeNull();
    expect(screen.getByRole("table", { name: "Output price history" }).textContent).toContain("$50");
  });

  it("selects the long-context tab without selecting the short price", () => {
    render(
      <PriceHistoryChart
        series={[
          series("input", "Input", 0, "10", "2026-10-18"),
          series(
            "input",
            "Input, long context",
            0,
            "20",
            "2026-10-18",
            "input:longContext",
            "Cutoff not stated.",
          ),
        ]}
      />,
    );

    expect(screen.getByRole("tab", { name: "Input", selected: true })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Input, long context", selected: false })).toBeTruthy();
    expect(screen.queryByText("Cutoff not stated.")).toBeNull();

    fireEvent.click(screen.getByRole("tab", { name: "Input, long context" }));

    expect(screen.getByRole("tab", { name: "Input", selected: false })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Input, long context", selected: true })).toBeTruthy();
    expect(screen.getByText("Cutoff not stated.")).toBeTruthy();
    expect(screen.getByRole("table", { name: "Input, long context price history" }).textContent).toContain(
      "$20",
    );
  });

  it("throws when a segment day is not a calendar day", () => {
    expect(() =>
      render(
        <PriceHistoryChart
          series={[
            {
              id: "input",
              dimension: "input",
              label: "Input",
              note: null,
              latestAmountText: "1",
              changeCount: 0,
              segments: [
                {
                  kind: "known",
                  from: "June 1",
                  to: "2026-06-02",
                  amountText: "1",
                  amount: 1,
                  label: "Changed on or before June 1.",
                },
              ],
            },
          ]}
        />,
      ),
    ).toThrow(/YYYY-MM-DD/);
  });

  it("shortens a UTC instant to a month and day", () => {
    expect(shortUtcDay(Date.UTC(2026, 9, 18))).toBe("Oct 18");
  });

  it("throws when there is no point to draw", () => {
    expect(() =>
      render(
        <PriceHistoryChart
          series={[
            {
              id: "input",
              dimension: "input",
              label: "Input",
              note: null,
              latestAmountText: "1",
              changeCount: 0,
              segments: [],
            },
          ]}
        />,
      ),
    ).toThrow(/no points/);
  });
});
