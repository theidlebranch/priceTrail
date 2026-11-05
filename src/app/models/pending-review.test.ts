import { describe, expect, it } from "vitest";
import { changeUnderReview } from "./pending-review";

/**
 * flagged is the only status that means a person still has to look.
 * ok, confirmed, and rejected are not a waiting change.
 * An unknown status must throw. A typo must not look like "no banner."
 */
describe("changeUnderReview", () => {
  it("is on when any status is flagged", () => {
    expect(changeUnderReview(["flagged"])).toBe(true);
    expect(changeUnderReview(["confirmed", "flagged"])).toBe(true);
  });

  it("stays off for a finished review, a passed cell check, or no items", () => {
    expect(changeUnderReview([])).toBe(false);
    expect(changeUnderReview(["ok"])).toBe(false);
    expect(changeUnderReview(["confirmed"])).toBe(false);
    expect(changeUnderReview(["rejected"])).toBe(false);
    expect(changeUnderReview(["confirmed", "rejected", "ok"])).toBe(false);
  });

  it("throws when a status is not one of the four review values", () => {
    expect(() => changeUnderReview(["maybe"])).toThrow(/review status maybe is not known/);
    expect(() => changeUnderReview([""])).toThrow(/review status {2}is not known/);
  });
});
