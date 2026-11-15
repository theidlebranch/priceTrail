import { describe, expect, it } from "vitest";
import { assertPublicSlug } from "@/app/models/model-list-entries";
import { modelSlugs, reviewCandidateId, reviewItemId, reviewSignalId, reviewSourceId } from "@/proxy";

describe("modelSlugs", () => {
  it("decodes an encoded list link to the stored slug", () => {
    expect(modelSlugs("/models/anthropic/model%23draft")).toEqual({
      labSlug: "anthropic",
      modelSlug: "model#draft",
    });
    expect(modelSlugs("/models/lab%3Fdraft/claude-fable-5.1")).toEqual({
      labSlug: "lab?draft",
      modelSlug: "claude-fable-5.1",
    });
  });

  it("decodes a dot segment so the slug check still rejects it", () => {
    const slugs = modelSlugs("/models/anthropic/%2E%2E");

    expect(slugs?.modelSlug).toBe("..");
    expect(() => assertPublicSlug(slugs?.modelSlug ?? "", "model")).toThrow(/model slug/);
    expect(() => assertPublicSlug(modelSlugs("/models/%2Fhidden/model")?.labSlug ?? "", "lab")).toThrow(
      /lab slug/,
    );
  });

  it("throws on a broken percent sequence instead of looking it up", () => {
    expect(() => modelSlugs("/models/anthropic/%")).toThrow(/model slug/);
  });
});

describe("reviewItemId", () => {
  it("reads a whole-number item id and ignores the rest of the review site", () => {
    expect(reviewItemId("/review/items/4")).toBe(4);
    expect(reviewItemId("/review/items/4/")).toBe(4);
    expect(reviewItemId("/review")).toBeNull();
    expect(reviewItemId("/review/sign-in")).toBeNull();
    expect(reviewItemId("/review/sources")).toBeNull();
  });

  it("throws when the id is not a whole number", () => {
    expect(() => reviewItemId("/review/items/01")).toThrow(/whole number/);
    expect(() => reviewItemId("/review/items/nope")).toThrow(/whole number/);
  });

  it("throws on a broken percent sequence instead of looking it up", () => {
    expect(() => reviewItemId("/review/items/%")).toThrow(/encoded path segment/);
  });
});

describe("reviewSourceId", () => {
  it("reads a whole-number source id and ignores the source list", () => {
    expect(reviewSourceId("/review/sources/4")).toBe(4);
    expect(reviewSourceId("/review/sources/4/")).toBe(4);
    expect(reviewSourceId("/review/sources")).toBeNull();
    expect(reviewSourceId("/review")).toBeNull();
    expect(reviewSourceId("/review/items/4")).toBeNull();
  });

  it("throws when the id is not a whole number", () => {
    expect(() => reviewSourceId("/review/sources/01")).toThrow(/whole number/);
    expect(() => reviewSourceId("/review/sources/nope")).toThrow(/whole number/);
  });

  it("throws on a broken percent sequence instead of looking it up", () => {
    expect(() => reviewSourceId("/review/sources/%")).toThrow(/encoded path segment/);
  });
});

describe("reviewCandidateId", () => {
  it("reads a whole-number candidate id and ignores the review list", () => {
    expect(reviewCandidateId("/review/candidates/4")).toBe(4);
    expect(reviewCandidateId("/review/candidates/4/")).toBe(4);
    expect(reviewCandidateId("/review/candidates")).toBeNull();
    expect(reviewCandidateId("/review")).toBeNull();
    expect(reviewCandidateId("/review/signals/4")).toBeNull();
  });

  it("throws when the id is not a whole number", () => {
    expect(() => reviewCandidateId("/review/candidates/01")).toThrow(/whole number/);
    expect(() => reviewCandidateId("/review/candidates/nope")).toThrow(/whole number/);
  });

  it("throws on a broken percent sequence instead of looking it up", () => {
    expect(() => reviewCandidateId("/review/candidates/%")).toThrow(/encoded path segment/);
  });
});

describe("reviewSignalId", () => {
  it("reads a whole-number signal id and ignores the signal list", () => {
    expect(reviewSignalId("/review/signals/4")).toBe(4);
    expect(reviewSignalId("/review/signals/4/")).toBe(4);
    expect(reviewSignalId("/review/signals")).toBeNull();
    expect(reviewSignalId("/review")).toBeNull();
    expect(reviewSignalId("/review/sources/4")).toBeNull();
  });

  it("throws when the id is not a whole number", () => {
    expect(() => reviewSignalId("/review/signals/01")).toThrow(/whole number/);
    expect(() => reviewSignalId("/review/signals/nope")).toThrow(/whole number/);
  });

  it("throws on a broken percent sequence instead of looking it up", () => {
    expect(() => reviewSignalId("/review/signals/%")).toThrow(/encoded path segment/);
  });
});
