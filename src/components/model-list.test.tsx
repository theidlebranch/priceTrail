import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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

const mythos: ModelListEntry = {
  labName: "Anthropic",
  modelName: "Claude Mythos 5.1",
  href: "/models/anthropic/claude-mythos-5.1",
  retired: false,
};

const gemini: ModelListEntry = {
  labName: "Google",
  modelName: "Gemini 4 Argon",
  href: "/models/google/gemini-4-argon",
  retired: false,
};

describe("ModelList", () => {
  it("links a model to its lab and slug path", () => {
    render(<ModelList entries={[fable]} />);

    const link = screen.getByRole("link", { name: /Claude Fable 5\.1/ });
    expect(link.getAttribute("href")).toBe("/models/anthropic/claude-fable-5.1");
    expect(link.textContent).toContain("Anthropic");
    expect(screen.getByText("1 model")).toBeTruthy();
    expect(screen.queryByText("Retired")).toBeNull();
    expect(screen.queryByText("All prices shown on this page are examples.")).toBeNull();
  });

  it("shows Retired on a model that is no longer current", () => {
    render(<ModelList entries={[{ ...fable, retired: true }]} />);

    expect(screen.getByText("Retired")).toBeTruthy();
    expect(screen.queryByText(/\$/)).toBeNull();
  });

  it("shows an empty catalog without a search field or example prices", () => {
    render(<ModelList entries={[]} />);

    expect(screen.getByText("No models are tracked yet.")).toBeTruthy();
    expect(screen.getByText("0 models")).toBeTruthy();
    expect(screen.queryByRole("searchbox", { name: "Search models" })).toBeNull();
    expect(screen.queryByRole("radio")).toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.queryByText("All prices shown on this page are examples.")).toBeNull();
  });

  it("counts the loaded rows, including more than one", () => {
    render(<ModelList entries={[fable, gemini]} />);

    expect(screen.getByText("2 models")).toBeTruthy();
  });

  it("starts from the header search query", () => {
    render(<ModelList entries={[fable, mythos, gemini]} initialQuery="mythos" />);

    expect(screen.getByRole("link", { name: /Claude Mythos 5\.1/ })).toBeTruthy();
    expect(screen.queryByRole("link", { name: /Claude Fable 5\.1/ })).toBeNull();
    const search = screen.getByRole("searchbox", { name: "Search models" });
    expect(search instanceof HTMLInputElement && search.value).toBe("mythos");
  });

  it("filters by model name and leaves the lab counts unchanged", () => {
    render(<ModelList entries={[fable, mythos, gemini]} />);

    fireEvent.change(screen.getByRole("searchbox", { name: "Search models" }), {
      target: { value: "mythos" },
    });

    expect(screen.getByRole("link", { name: /Claude Mythos 5\.1/ })).toBeTruthy();
    expect(screen.queryByRole("link", { name: /Claude Fable 5\.1/ })).toBeNull();
    expect(screen.queryByRole("link", { name: /Gemini 4 Argon/ })).toBeNull();
    expect(screen.getByText("3 models")).toBeTruthy();
    expect(screen.getByRole("radio", { name: "All 3" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: "Anthropic 2" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: "Google 1" })).toBeTruthy();
  });

  it("filters to one lab and restores the full list from All", () => {
    render(<ModelList entries={[fable, gemini]} />);

    fireEvent.click(screen.getByRole("radio", { name: "Google 1" }));

    expect(screen.getByRole("link", { name: /Gemini 4 Argon/ })).toBeTruthy();
    expect(screen.queryByRole("link", { name: /Claude Fable 5\.1/ })).toBeNull();

    fireEvent.click(screen.getByRole("radio", { name: "All 2" }));

    expect(screen.getByRole("link", { name: /Claude Fable 5\.1/ })).toBeTruthy();
    expect(screen.getByRole("link", { name: /Gemini 4 Argon/ })).toBeTruthy();
  });

  it("says when the filter matches nothing and keeps the search field", () => {
    render(<ModelList entries={[fable]} />);

    fireEvent.change(screen.getByRole("searchbox", { name: "Search models" }), {
      target: { value: "zzzz" },
    });

    expect(screen.getByText("No models match.")).toBeTruthy();
    expect(screen.getByRole("searchbox", { name: "Search models" })).toBeTruthy();
    expect(screen.queryByRole("link")).toBeNull();
  });
});
