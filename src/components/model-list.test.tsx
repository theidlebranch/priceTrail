import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ModelList } from "@/components/model-list";
import type { ModelListEntry } from "@/app/models/model-list-entries";

afterEach(() => {
  cleanup();
});

const fable: ModelListEntry = {
  labName: "Anthropic",
  modelName: "Claude Fable 5.1",
  href: "/models/anthropic/claude-fable-5.1",
  retired: false,
};

describe("ModelList", () => {
  it("links a model to its lab and slug path", () => {
    render(<ModelList entries={[fable]} />);

    const link = screen.getByRole("link", { name: "Claude Fable 5.1" });
    expect(link.getAttribute("href")).toBe("/models/anthropic/claude-fable-5.1");
    expect(screen.getByText("Anthropic")).toBeTruthy();
    expect(screen.queryByText("Retired")).toBeNull();
    expect(screen.queryByText("All prices shown on this page are examples.")).toBeNull();
  });

  it("shows Retired on a model that is no longer current", () => {
    render(<ModelList entries={[{ ...fable, retired: true }]} />);

    expect(screen.getByText("Retired")).toBeTruthy();
  });

  it("shows an empty catalog without cards or example prices", () => {
    render(<ModelList entries={[]} />);

    expect(screen.getByText("No models are tracked yet.")).toBeTruthy();
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.queryByText("All prices shown on this page are examples.")).toBeNull();
  });
});
