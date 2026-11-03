import { describe, expect, it } from "vitest";
import { assertPublicSlug } from "@/app/models/model-list-entries";
import { modelSlugs } from "@/proxy";

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
