import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { OfficialCandidateDetailView } from "@/app/review/official-candidate-view";
import { OfficialCandidateDetail } from "@/components/official-candidate-detail";

vi.mock("@/app/review/publish-candidate-action", () => ({
  publishCandidateAction: async () => null,
}));

afterEach(() => {
  cleanup();
});

function view(overrides: Partial<OfficialCandidateDetailView> = {}): OfficialCandidateDetailView {
  return {
    modelName: "Claude Haiku 4.5",
    labName: "Anthropic",
    modelSlug: "claude-haiku-4.5",
    sourceUrl: "https://example.test/pricing",
    fetchedAtText: "2026-11-01 00:00:00 UTC",
    statusText: "Waiting for review.",
    prices: [{ dimensionLabel: "Input", amountText: "1", conditionText: null }],
    refusal: null,
    scheduleText: null,
    canDecide: true,
    candidateId: 4,
    decision: "publish",
    decisionText:
      "Add and publish adds this model and publishes this price. Reject leaves it off the catalog.",
    hint: null,
    ...overrides,
  };
}

describe("OfficialCandidateDetail", () => {
  it("shows Add and publish and Reject while the card is waiting", () => {
    render(<OfficialCandidateDetail view={view()} />);

    expect(screen.getByRole("heading", { name: "Claude Haiku 4.5" })).toBeTruthy();
    expect(screen.getByText("1")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Add and publish" }).getAttribute("value")).toBe(
      "publish",
    );
    expect(screen.getByRole("button", { name: "Reject" }).getAttribute("value")).toBe("reject");
  });

  it("hides Add and publish when the price cannot be written, and keeps Reject", () => {
    render(
      <OfficialCandidateDetail
        view={view({
          prices: null,
          refusal: "no price for claude-haiku-4.5 applies on 2026-11-06",
        })}
      />,
    );

    expect(screen.getByText(/no price for claude-haiku-4.5/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Add and publish" })).toBeNull();
    expect(screen.getByRole("button", { name: "Reject" })).toBeTruthy();
  });

  it("shows Accept and hides Add and publish for a retirement", () => {
    render(
      <OfficialCandidateDetail
        view={view({
          decision: "accept",
          prices: null,
          hint: "retired",
          decisionText: "Accept marks this model retired and does not publish a price.",
        })}
      />,
    );

    expect(screen.getByText("retired")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Accept" }).getAttribute("value")).toBe("accept");
    expect(screen.queryByRole("button", { name: "Add and publish" })).toBeNull();
    expect(screen.getByRole("button", { name: "Reject" })).toBeTruthy();
  });

  it("hides both buttons after the model is published", () => {
    render(
      <OfficialCandidateDetail
        view={view({
          canDecide: false,
          statusText: "This model was added and its price was published.",
        })}
      />,
    );

    expect(screen.queryByRole("button", { name: "Add and publish" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Reject" })).toBeNull();
  });
});
