import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { SourceCheckEntry, SourceHistoryView } from "@/app/review/source-health";
import { SourceHistory } from "@/components/source-history";

afterEach(() => {
  cleanup();
});

const URL = "https://platform.claude.com/docs/en/about-claude/pricing.md";

function check(overrides: Partial<SourceCheckEntry> = {}): SourceCheckEntry {
  return {
    id: 10,
    visitColor: "ok",
    outcomeText: "Prices unchanged",
    checkedAtText: "2026-11-07 12:00:00 UTC",
    httpStatusText: "200",
    note: null,
    archiveColor: "neutral",
    archiveText: "Wayback was not asked.",
    snapshotText: null,
    archiveUrl: null,
    ...overrides,
  };
}

function view(overrides: Partial<SourceHistoryView> = {}): SourceHistoryView {
  return {
    url: URL,
    typeText: "official",
    activeText: "Active",
    checks: [check()],
    ...overrides,
  };
}

describe("SourceHistory", () => {
  it("shows the source, both color keys, and one visit", () => {
    render(<SourceHistory view={view()} />);

    expect(screen.getByRole("heading", { name: URL })).toBeTruthy();
    expect(screen.getByText("official")).toBeTruthy();
    expect(screen.getByText("Active")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Back to source health" }).getAttribute("href")).toBe(
      "/review/sources",
    );
    expect(screen.getByRole("heading", { name: "Visit" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Wayback" })).toBeTruthy();

    const row = screen.getByText("2026-11-07 12:00:00 UTC").closest("li");
    expect(row?.className).toContain("border-l-status-ok");
    expect(row?.textContent).toContain("Prices unchanged. HTTP status: 200.");
    const archive = screen.getAllByText("Wayback was not asked.").find((node) => node.closest("li") === row);
    expect(archive?.className).toContain("text-status-neutral");
  });

  it("colors a changed visit and links the archive copy", () => {
    render(
      <SourceHistory
        view={view({
          checks: [
            check({
              id: 7,
              visitColor: "info",
              outcomeText: "Parsed prices changed",
              archiveColor: "error",
              archiveText: "Archive failed. The stored copy remains.",
              snapshotText: "Snapshot 313.",
              archiveUrl: "https://web.archive.org/web/1",
              note: "new prices",
            }),
          ],
        })}
      />,
    );

    const row = screen.getByText("Snapshot 313.").closest("li");
    expect(row?.className).toContain("border-l-status-info");
    expect(row?.textContent).toContain("Note: new prices");
    const archive = screen
      .getAllByText("Archive failed. The stored copy remains.")
      .find((node) => node.closest("li") === row);
    expect(archive?.className).toContain("text-status-error");
    const copy = screen.getByRole("link", { name: "https://web.archive.org/web/1" });
    expect(copy.getAttribute("href")).toBe("https://web.archive.org/web/1");
  });

  it("says the source has not been checked when there are no visits", () => {
    render(<SourceHistory view={view({ checks: [] })} />);

    expect(screen.getByText("This source has not been checked yet.")).toBeTruthy();
    expect(screen.queryByText(/HTTP status/)).toBeNull();
  });
});
