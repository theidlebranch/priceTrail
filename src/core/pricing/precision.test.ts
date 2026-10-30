import { describe, expect, it } from "vitest";
import { pricePrecisionLabel } from "./precision";

/**
 * These dates are the worked examples in docs/price-tables.md.
 * The label is derived. It is not a column.
 */
describe("pricePrecisionLabel", () => {
  it("uses the announced day when a source named one", () => {
    expect(
      pricePrecisionLabel({
        firstSeenAt: new Date("2026-06-02T16:00:00Z"),
        announcedOn: "2026-06-01",
      }),
    ).toEqual({
      kind: "announced",
      chartStart: "2026-06-01",
    });
  });

  it("uses the UTC day of firstSeenAt when no source named a day", () => {
    expect(
      pricePrecisionLabel({
        firstSeenAt: new Date("2026-06-02T16:00:00Z"),
      }),
    ).toEqual({
      kind: "observed",
      chartStart: "2026-06-02",
      wording: "changed on or before",
    });
  });

  it("treats a blank announced day the same as a missing one", () => {
    expect(
      pricePrecisionLabel({
        firstSeenAt: new Date("2026-01-15T16:00:00Z"),
        announcedOn: null,
      }),
    ).toEqual({
      kind: "observed",
      chartStart: "2026-01-15",
      wording: "changed on or before",
    });
  });

  it("labels 23:30Z as that UTC day, even when local time is already the next day", () => {
    // 2026-06-01T23:30:00Z is 01:30 the next morning in central Europe.
    // The chart day follows UTC, not the machine timezone.
    expect(
      pricePrecisionLabel({
        firstSeenAt: new Date("2026-06-01T23:30:00Z"),
      }).chartStart,
    ).toBe("2026-06-01");
  });
});
