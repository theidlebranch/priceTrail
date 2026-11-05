import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PriceHistoryChart } from "@/components/price-history-chart";
import type { PriceHistorySeries } from "@/core/pricing/price-history";

function series(
  dimension: PriceHistorySeries["dimension"],
  label: string,
  changeCount: number,
  amountText: string,
  from: string,
): PriceHistorySeries {
  return {
    dimension,
    label,
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

  it("throws when a segment day is not a calendar day", () => {
    expect(() =>
      render(
        <PriceHistoryChart
          series={[
            {
              dimension: "input",
              label: "Input",
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

  it("throws when there is no point to draw", () => {
    expect(() =>
      render(
        <PriceHistoryChart
          series={[
            {
              dimension: "input",
              label: "Input",
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
