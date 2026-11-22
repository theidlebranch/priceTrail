import { describe, expect, it } from "vitest";
import { requestCountLabel, toLabRequestEntries, type LabRequestRow } from "@/app/labs/lab-request-view";

function row(overrides: Partial<LabRequestRow> = {}): LabRequestRow {
  return {
    id: 1,
    labName: "Mistral",
    suggestedBy: "google:123",
    suggestedAt: new Date("2026-11-22T15:04:00.000Z"),
    status: "pending",
    reviewNote: null,
    ...overrides,
  };
}

describe("toLabRequestEntries", () => {
  it("writes a waiting sentence and a short UTC time", () => {
    expect(toLabRequestEntries([row()])).toEqual([
      {
        id: 1,
        labName: "Mistral",
        suggestedBy: "google:123",
        suggestedAtText: "Nov 22 · 15:04 UTC",
        statusLabel: "Waiting for a reviewer.",
        reviewNote: null,
      },
    ]);
  });

  it("says an accepted lab is not tracked yet, and a declined one stays declined", () => {
    expect(toLabRequestEntries([row({ status: "accepted", reviewNote: "Later." })])[0]?.statusLabel).toBe(
      "Accepted. This lab is not tracked yet.",
    );
    expect(toLabRequestEntries([row({ status: "declined" })])[0]?.statusLabel).toBe("Declined.");
  });

  it("throws when the name, id, or time cannot be shown", () => {
    expect(() => toLabRequestEntries([row({ labName: "  " })])).toThrow(/lab name is empty/);
    expect(() => toLabRequestEntries([row({ id: 0 })])).toThrow(/request id/);
    expect(() => toLabRequestEntries([row({ suggestedAt: new Date("nope") })])).toThrow(/time/);
  });

  it("labels the waiting count", () => {
    expect(requestCountLabel(1)).toBe("1 waiting");
    expect(requestCountLabel(0)).toBe("0 waiting");
  });
});
