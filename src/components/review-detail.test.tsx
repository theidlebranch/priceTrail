import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReviewDetailPrice, ReviewDetailView } from "@/app/review/review-detail";
import { ReviewDetail } from "@/components/review-detail";

vi.mock("@/app/review/decide-review-action", () => ({
  decideReviewAction: async () => null,
}));

afterEach(() => {
  cleanup();
});

const sourceUrl = "https://platform.claude.com/docs/en/about-claude/pricing.md";

function price(overrides: Partial<ReviewDetailPrice> = {}): ReviewDetailPrice {
  return {
    dimensionLabel: "Input",
    amountText: "10.50",
    conditionText: null,
    scheduleText: null,
    note: null,
    sourceText: "official",
    ...overrides,
  };
}

function view(overrides: Partial<ReviewDetailView> = {}): ReviewDetailView {
  return {
    modelName: "Claude Mythos 5.1",
    labName: "Anthropic",
    sourceUrl,
    sourceTypeLabel: "Official pricing page",
    fetchedAtText: "2026-11-01 00:00:00 UTC",
    statusText: "Waiting for review.",
    notPublishedText: "This is not a published price.",
    reviewNote: null,
    reviewedBy: null,
    reviewedAtText: null,
    cellCheckText: "No cell check is stored for this item.",
    prices: {
      kind: "parsed",
      warningCount: 0,
      warningText: null,
      rows: [
        price(),
        price({
          dimensionLabel: "Output",
          amountText: "50",
          scheduleText: "from 2026-10-18",
        }),
      ],
    },
    itemId: 4,
    canDecide: true,
    actionsText: "Confirm publishes this price. Reject publishes nothing.",
    ...overrides,
  };
}

function headerNames(): string[] {
  return screen.getAllByRole("columnheader").map((header) => header.textContent ?? "");
}

describe("ReviewDetail", () => {
  it("shows the waiting sentences, the decision buttons, and the source as text", () => {
    render(<ReviewDetail view={view()} />);

    expect(screen.getByRole("link", { name: "Review" }).getAttribute("href")).toBe("/review");
    expect(screen.getByRole("heading", { name: "Claude Mythos 5.1" })).toBeTruthy();
    expect(screen.getByText("Anthropic")).toBeTruthy();
    expect(screen.getByText("Waiting for review.")).toBeTruthy();
    expect(screen.getByText("This is not a published price.")).toBeTruthy();
    expect(screen.getByText("No cell check is stored for this item.")).toBeTruthy();
    expect(
      screen.getByText("Confirm publishes this price. Reject publishes nothing."),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Confirm" }).getAttribute("name")).toBe(
      "decision",
    );
    expect(screen.getByRole("button", { name: "Confirm" }).getAttribute("value")).toBe(
      "confirm",
    );
    expect(screen.getByRole("button", { name: "Reject" }).getAttribute("value")).toBe("reject");
    expect(screen.getByRole("textbox", { name: "Note" })).toBeTruthy();

    expect(screen.getByText("Official pricing page")).toBeTruthy();
    expect(screen.getByText(sourceUrl).closest("a")).toBeNull();
    expect(screen.getByText("Fetched 2026-11-01 00:00:00 UTC.")).toBeTruthy();
    expect(screen.getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual([
      "/review",
    ]);
  });

  it("keeps one table row per price and hides empty condition and note columns", () => {
    render(<ReviewDetail view={view()} />);

    expect(headerNames()).toEqual([
      "Dimension",
      "USD per 1M tokens",
      "Schedule",
      "Row source",
    ]);
    expect(screen.getAllByRole("row")).toHaveLength(3);
    expect(screen.getByText("10.50")).toBeTruthy();
    expect(screen.getByText("50")).toBeTruthy();
    expect(screen.getByText("from 2026-10-18")).toBeTruthy();
    expect(screen.getAllByText("official")).toHaveLength(2);
  });

  it("keeps Condition and Note when any row has a value, and shows the warning sentence", () => {
    render(
      <ReviewDetail
        view={view({
          prices: {
            kind: "parsed",
            warningCount: 2,
            warningText: "This snapshot has 2 warnings.",
            rows: [
              price({ conditionText: "prompts up to 100,000 tokens" }),
              price({
                dimensionLabel: "Output",
                amountText: "50",
                note: "Standard table",
              }),
            ],
          },
        })}
      />,
    );

    expect(headerNames()).toEqual([
      "Dimension",
      "USD per 1M tokens",
      "Condition",
      "Schedule",
      "Note",
      "Row source",
    ]);
    expect(screen.getByText("prompts up to 100,000 tokens")).toBeTruthy();
    expect(screen.getByText("Standard table")).toBeTruthy();
    expect(screen.getByText("This snapshot has 2 warnings.")).toBeTruthy();
  });

  it("shows the not-a-price-list sentence and no table", () => {
    render(
      <ReviewDetail
        view={view({
          sourceTypeLabel: "Wayback",
          prices: {
            kind: "not-a-price-list",
            message: "This snapshot is not a parsed price list.",
          },
        })}
      />,
    );

    expect(screen.getByText("Wayback")).toBeTruthy();
    expect(screen.getByText("This snapshot is not a parsed price list.")).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.queryByText("This snapshot has 1 warning.")).toBeNull();
  });

  it("shows a recorded decision without confirm or reject", () => {
    render(
      <ReviewDetail
        view={view({
          statusText: "A reviewer confirmed this item.",
          canDecide: false,
          actionsText: "This decision is already recorded.",
          reviewedBy: "google:123",
          reviewedAtText: "2026-11-02 15:04:05 UTC",
          reviewNote: "Checked the Standard table.",
        })}
      />,
    );

    expect(screen.getByText("A reviewer confirmed this item.")).toBeTruthy();
    expect(screen.getByText("This decision is already recorded.")).toBeTruthy();
    expect(screen.getByText("Reviewed by google:123.")).toBeTruthy();
    expect(screen.getByText("Reviewed at 2026-11-02 15:04:05 UTC.")).toBeTruthy();
    expect(screen.getByText("Checked the Standard table.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Confirm" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Reject" })).toBeNull();
  });
});
