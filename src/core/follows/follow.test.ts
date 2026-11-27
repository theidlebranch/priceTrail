import { describe, expect, it } from "vitest";
import { FollowRefusal, checkedFollowAccountId, checkedFollowTarget } from "@/core/follows/follow";

describe("checkedFollowAccountId", () => {
  it("keeps a google or github account id", () => {
    expect(checkedFollowAccountId("google:123")).toBe("google:123");
    expect(checkedFollowAccountId("github:42")).toBe("github:42");
  });

  it("refuses a blank id, an email, and an unknown provider", () => {
    expect(() => checkedFollowAccountId("")).toThrow(FollowRefusal);
    expect(() => checkedFollowAccountId("ada@example.com")).toThrow(/account id is missing/);
    expect(() => checkedFollowAccountId("google:")).toThrow(FollowRefusal);
    expect(() => checkedFollowAccountId("okta:123")).toThrow(FollowRefusal);
  });
});

describe("checkedFollowTarget", () => {
  it("keeps one model id or one lab id", () => {
    expect(checkedFollowTarget({ kind: "model", modelId: 4 })).toEqual({ kind: "model", modelId: 4 });
    expect(checkedFollowTarget({ kind: "lab", labId: 1 })).toEqual({ kind: "lab", labId: 1 });
  });

  it("refuses an id that is not a real row", () => {
    expect(() => checkedFollowTarget({ kind: "model", modelId: 0 })).toThrow(/that model is not tracked/);
    expect(() => checkedFollowTarget({ kind: "lab", labId: 1.5 })).toThrow(/that lab is not tracked/);
  });
});
