import { describe, expect, it } from "vitest";
import {
  LabRequestRefusal,
  checkedAccountId,
  checkedLabName,
  checkedRequestId,
  checkedReviewNote,
  labNameKey,
  matchesTrackedLab,
} from "@/core/labs/suggest-lab";

describe("checkedLabName", () => {
  it("keeps the typed name and drops surrounding spaces", () => {
    expect(checkedLabName("  Mistral AI  ")).toBe("Mistral AI");
  });

  it("refuses a blank name", () => {
    expect(() => checkedLabName("   ")).toThrow(LabRequestRefusal);
    expect(() => checkedLabName("   ")).toThrow(/lab name is empty/);
  });
});

describe("labNameKey", () => {
  it("compares names without case or surrounding spaces", () => {
    expect(labNameKey("  OpenAI ")).toBe("openai");
  });
});

describe("matchesTrackedLab", () => {
  const tracked = [{ name: "OpenAI", slug: "openai" }];

  it("matches the stored name or the slug", () => {
    expect(matchesTrackedLab("openai", tracked)).toBe(true);
    expect(matchesTrackedLab("  OPENAI ", tracked)).toBe(true);
  });

  it("does not match a different lab", () => {
    expect(matchesTrackedLab("Mistral", tracked)).toBe(false);
  });
});

describe("checkedAccountId", () => {
  it("keeps a google or github account id", () => {
    expect(checkedAccountId("google:123")).toBe("google:123");
    expect(checkedAccountId("github:42")).toBe("github:42");
  });

  it("refuses an email or a bare word", () => {
    expect(() => checkedAccountId("ada@example.com")).toThrow(LabRequestRefusal);
    expect(() => checkedAccountId("seed")).toThrow(/account id is missing/);
  });
});

describe("checkedReviewNote", () => {
  it("keeps a note and drops surrounding spaces", () => {
    expect(checkedReviewNote("  Not this quarter.  ")).toBe("Not this quarter.");
  });

  it("refuses a blank note", () => {
    expect(() => checkedReviewNote("  ")).toThrow(/review note is empty/);
  });
});

describe("checkedRequestId", () => {
  it("keeps a positive whole number", () => {
    expect(checkedRequestId(4)).toBe(4);
  });

  it("refuses zero, a fraction, or a negative id", () => {
    expect(() => checkedRequestId(0)).toThrow(/request id/);
    expect(() => checkedRequestId(1.5)).toThrow(/request id/);
    expect(() => checkedRequestId(-1)).toThrow(/request id/);
  });
});
