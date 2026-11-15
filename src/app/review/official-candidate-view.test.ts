import { describe, expect, it } from "vitest";
import {
  parseOfficialCandidateId,
  toOfficialCandidateDetail,
  toOfficialCandidateEntries,
  type OfficialCandidateDetailRow,
} from "@/app/review/official-candidate-view";

const SEEN = new Date("2026-11-01T00:00:00.000Z");
const REVIEWED = new Date("2026-11-06T19:00:00.000Z");

function detail(overrides: Partial<OfficialCandidateDetailRow> = {}): OfficialCandidateDetailRow {
  return {
    id: 4,
    status: "pending_review",
    labName: "Anthropic",
    modelName: "Claude Haiku 4.5",
    modelSlug: "claude-haiku-4.5",
    sourceUrl: "https://example.test/pricing",
    fetchedAt: SEEN,
    parsedData: {
      rows: [
        {
          provider: "anthropic",
          modelName: "Claude Haiku 4.5",
          modelSlug: "claude-haiku-4.5",
          dimension: "input",
          usdPer1M: "1",
          source: "official",
        },
      ],
      warnings: [],
    },
    ...overrides,
  };
}

describe("toOfficialCandidateEntries", () => {
  it("links a waiting official model and skips nothing that is pending", () => {
    expect(
      toOfficialCandidateEntries([
        {
          id: 4,
          status: "pending_review",
          labName: "Anthropic",
          modelName: "Claude Haiku 4.5",
          sourceUrl: "https://example.test/pricing",
          firstSeenAt: SEEN,
        },
      ]),
    ).toEqual([
      {
        href: "/review/candidates/4",
        labName: "Anthropic",
        modelName: "Claude Haiku 4.5",
        sourceUrl: "https://example.test/pricing",
        firstSeenText: "2026-11-01 00:00:00 UTC",
      },
    ]);
  });

  it("throws when a row is not waiting", () => {
    expect(() =>
      toOfficialCandidateEntries([
        {
          id: 4,
          status: "approved",
          labName: "Anthropic",
          modelName: "Claude Haiku 4.5",
          sourceUrl: "https://example.test/pricing",
          firstSeenAt: SEEN,
        },
      ]),
    ).toThrow(/not waiting/);
  });
});

describe("toOfficialCandidateDetail", () => {
  it("shows the price Add and publish would write", () => {
    const view = toOfficialCandidateDetail(detail(), REVIEWED);

    expect(view.prices).toEqual([
      { dimensionLabel: "Input", amountText: "1", conditionText: null },
    ]);
    expect(view.refusal).toBeNull();
    expect(view.canDecide).toBe(true);
    expect(view.statusText).toBe("Waiting for review.");
  });

  it("keeps Reject available when no price applies that day", () => {
    const view = toOfficialCandidateDetail(
      detail({
        parsedData: {
          rows: [
            {
              provider: "anthropic",
              modelName: "Claude Haiku 4.5",
              modelSlug: "claude-haiku-4.5",
              dimension: "input",
              usdPer1M: "1",
              source: "official",
              validFrom: "2026-12-01",
            },
          ],
          warnings: [],
        },
      }),
      REVIEWED,
    );

    expect(view.prices).toBeNull();
    expect(view.refusal).toMatch(/no price for claude-haiku-4.5 applies on 2026-11-06/);
    expect(view.canDecide).toBe(true);
    expect(view.scheduleText).toMatch(/review day/);
  });

  it("hides the buttons after the model is published", () => {
    const view = toOfficialCandidateDetail(detail({ status: "approved" }), REVIEWED);
    expect(view.canDecide).toBe(false);
    expect(view.statusText).toMatch(/published/);
  });
});

describe("parseOfficialCandidateId", () => {
  it("rejects a leading zero", () => {
    expect(() => parseOfficialCandidateId("01")).toThrow(/whole number/);
  });
});
