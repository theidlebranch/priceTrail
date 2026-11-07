import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { ReviewListEntry } from "@/app/review/review-list";
import { ReviewList } from "@/components/review-list";

afterEach(() => {
  cleanup();
});

const fable: ReviewListEntry = {
  href: "/review/items/11",
  labName: "Anthropic",
  modelName: "Claude Fable 5.1",
  sourceUrl: "https://docs.anthropic.com/en/docs/about-claude/pricing",
  fetchedAtText: "2026-11-06 14:04:00 UTC",
  reviewNote: "Cache write looks new.",
};

const mythos: ReviewListEntry = {
  href: "/review/items/12",
  labName: "Anthropic",
  modelName: "Claude Mythos 5.1",
  sourceUrl: "https://docs.anthropic.com/en/docs/about-claude/pricing#mythos",
  fetchedAtText: "2026-11-06 14:05:00 UTC",
  reviewNote: null,
};

const gemini: ReviewListEntry = {
  href: "/review/items/13",
  labName: "Google",
  modelName: "Gemini 4 Argon",
  sourceUrl: "https://ai.google.dev/gemini-api/docs/pricing?hl=en",
  fetchedAtText: "2026-11-06 14:06:00 UTC",
  reviewNote: null,
};

describe("ReviewList", () => {
  it("links a waiting item and shows the note, url, and time", () => {
    render(<ReviewList entries={[fable]} />);

    const link = screen.getByRole("link", { name: /Claude Fable 5\.1/ });
    expect(link.getAttribute("href")).toBe("/review/items/11");
    expect(link.textContent).toContain("Anthropic");
    expect(link.textContent).toContain("2026-11-06 14:04:00 UTC");
    expect(link.textContent).toContain("https://docs.anthropic.com/en/docs/about-claude/pricing");
    expect(link.textContent).toContain("Cache write looks new.");
    expect(screen.getByText("1 waiting")).toBeTruthy();
    expect(screen.queryByText("Pending")).toBeNull();
    expect(screen.getByRole("link", { name: "Source health" }).getAttribute("href")).toBe(
      "/review/sources",
    );
  });

  it("hides the note when none is stored", () => {
    render(<ReviewList entries={[mythos]} />);

    const link = screen.getByRole("link", { name: /Claude Mythos 5\.1/ });
    expect(link.textContent).toContain("https://docs.anthropic.com/en/docs/about-claude/pricing#mythos");
    expect(link.textContent).not.toContain("Cache write looks new.");
    expect(screen.queryByText("Pending")).toBeNull();
  });

  it("shows an empty queue without a search field", () => {
    render(<ReviewList entries={[]} />);

    expect(screen.getByText("Nothing is waiting for review.")).toBeTruthy();
    expect(screen.getByText("0 waiting")).toBeTruthy();
    expect(screen.queryByRole("searchbox", { name: "Search by model name" })).toBeNull();
    expect(screen.queryByRole("radio")).toBeNull();
    expect(screen.queryByRole("link", { name: /Claude/ })).toBeNull();
    expect(screen.getByRole("link", { name: "Source health" }).getAttribute("href")).toBe(
      "/review/sources",
    );
  });

  it("counts the loaded rows, including more than one", () => {
    render(<ReviewList entries={[fable, gemini]} />);

    expect(screen.getByText("2 waiting")).toBeTruthy();
  });

  it("filters by model name and leaves the lab counts unchanged", () => {
    render(<ReviewList entries={[fable, mythos, gemini]} />);

    fireEvent.change(screen.getByRole("searchbox", { name: "Search by model name" }), {
      target: { value: "mythos" },
    });

    expect(screen.getByRole("link", { name: /Claude Mythos 5\.1/ })).toBeTruthy();
    expect(screen.queryByRole("link", { name: /Claude Fable 5\.1/ })).toBeNull();
    expect(screen.queryByRole("link", { name: /Gemini 4 Argon/ })).toBeNull();
    expect(screen.getByText("3 waiting")).toBeTruthy();
    expect(screen.getByRole("radio", { name: "All 3" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: "Anthropic 2" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: "Google 1" })).toBeTruthy();
  });

  it("filters to one lab and restores the full list from All", () => {
    render(<ReviewList entries={[fable, gemini]} />);

    fireEvent.click(screen.getByRole("radio", { name: "Google 1" }));

    expect(screen.getByRole("link", { name: /Gemini 4 Argon/ })).toBeTruthy();
    expect(screen.queryByRole("link", { name: /Claude Fable 5\.1/ })).toBeNull();

    fireEvent.click(screen.getByRole("radio", { name: "All 2" }));

    expect(screen.getByRole("link", { name: /Claude Fable 5\.1/ })).toBeTruthy();
    expect(screen.getByRole("link", { name: /Gemini 4 Argon/ })).toBeTruthy();
  });

  it("says when the filter matches nothing and keeps the search field", () => {
    render(<ReviewList entries={[fable]} />);

    fireEvent.change(screen.getByRole("searchbox", { name: "Search by model name" }), {
      target: { value: "zzzz" },
    });

    expect(screen.getByText("Nothing matches.")).toBeTruthy();
    expect(screen.getByRole("searchbox", { name: "Search by model name" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: /Claude Fable 5\.1/ })).toBeNull();
    expect(screen.getByRole("link", { name: "Source health" })).toBeTruthy();
  });
});
