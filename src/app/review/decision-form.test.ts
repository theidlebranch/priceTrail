import { describe, expect, it } from "vitest";
import { readDecisionForm } from "@/app/review/decision-form";

/**
 * The form can post any string. These checks run before a database
 * opens. A bad decision or a bad id fails on purpose.
 */

function form(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    data.set(key, value);
  }
  return data;
}

describe("readDecisionForm", () => {
  it("reads confirm, the item id, and the note", () => {
    expect(readDecisionForm(form({ decision: "confirm", itemId: "4", note: "Checked." }))).toEqual({
      decision: "confirm",
      observationItemId: 4,
      note: "Checked.",
    });
  });

  it("reads reject", () => {
    expect(readDecisionForm(form({ decision: "reject", itemId: "4", note: "No." })).decision).toBe(
      "reject",
    );
  });

  it("throws when the decision is not confirm or reject", () => {
    expect(() =>
      readDecisionForm(form({ decision: "approve", itemId: "4", note: "Checked." })),
    ).toThrow(/confirm or reject/);
  });

  it("throws when the item id is not a whole number", () => {
    expect(() =>
      readDecisionForm(form({ decision: "confirm", itemId: "4.5", note: "Checked." })),
    ).toThrow(/whole number/);
  });

  it("throws when the note is missing", () => {
    expect(() => readDecisionForm(form({ decision: "confirm", itemId: "4" }))).toThrow(
      /review note is empty/,
    );
  });
});
