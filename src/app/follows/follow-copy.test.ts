import { describe, expect, it } from "vitest";
import { followResultCopy, refusalSentence } from "@/app/follows/follow-copy";

describe("followResultCopy", () => {
  it("names a new model follow and a new lab follow", () => {
    expect(followResultCopy({ name: "Claude Fable 5.1", kind: "model", outcome: "followed" })).toEqual({
      title: "Following Claude Fable 5.1.",
      description: "It is on your Following page.",
    });
    expect(followResultCopy({ name: "Anthropic", kind: "lab", outcome: "followed" })).toEqual({
      title: "Following Anthropic.",
      description: "The lab is on your Following page. Each model is still its own follow.",
    });
  });

  it("says when the row was already there, removed, or already gone", () => {
    expect(followResultCopy({ name: "Anthropic", kind: "lab", outcome: "already" })).toEqual({
      title: "You already follow Anthropic.",
    });
    expect(followResultCopy({ name: "Claude Fable 5.1", kind: "model", outcome: "removed" })).toEqual({
      title: "Claude Fable 5.1 removed.",
      description: "It is no longer on your Following page.",
    });
    expect(followResultCopy({ name: "Anthropic", kind: "lab", outcome: "absent" })).toEqual({
      title: "You are not following Anthropic.",
    });
  });
});

describe("refusalSentence", () => {
  it("keeps a missing model or lab as a sentence", () => {
    expect(refusalSentence("that model is not tracked", "model")).toBe("That model is not tracked.");
    expect(refusalSentence("that lab is not tracked", "lab")).toBe("That lab is not tracked.");
  });

  it("asks a guest to sign in", () => {
    expect(refusalSentence("account id is missing", "model")).toBe("Sign in to follow this model.");
    expect(refusalSentence("account id is missing", "lab")).toBe("Sign in to follow this lab.");
  });
});
