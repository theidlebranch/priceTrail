import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { SourceHealthEntry, SourceHealthView } from "@/app/review/source-health";
import { SourceHealthList } from "@/components/source-health-list";
import { SourceHealthPageHeader } from "@/components/source-health-page-header";

afterEach(() => {
  cleanup();
});

const URL = "https://platform.claude.com/docs/en/about-claude/pricing.md";

function entry(overrides: Partial<SourceHealthEntry> = {}): SourceHealthEntry {
  return {
    url: URL,
    typeText: "official",
    activeText: "Active",
    lastCheckedText: "2026-11-07 12:00:00 UTC",
    outcomeText: "Prices unchanged",
    checkedAtText: "2026-11-07 12:00:00 UTC",
    httpStatusText: "200",
    note: null,
    archiveText: "Archived.",
    warning: null,
    ...overrides,
  };
}

function view(overrides: Partial<SourceHealthView> = {}): SourceHealthView {
  return {
    missingCheckerWarnings: [],
    entries: [entry()],
    ...overrides,
  };
}

describe("SourceHealthPageHeader", () => {
  it("omits the counts until the rows are known", () => {
    render(<SourceHealthPageHeader />);

    expect(screen.getByRole("heading", { name: "Source health" })).toBeTruthy();
    expect(
      screen.getByText(/A warning here is not a published price/),
    ).toBeTruthy();
    expect(screen.getByRole("link", { name: "Back to the review queue" }).getAttribute("href")).toBe(
      "/review",
    );
    expect(screen.queryByText(/need attention/)).toBeNull();
    expect(screen.queryByText(/healthy/)).toBeNull();
    expect(screen.queryByText(/\d+ sources?/)).toBeNull();
  });
});

describe("SourceHealthList", () => {
  it("shows a quiet source with its url, check, and archive, and no amber border", () => {
    render(<SourceHealthList view={view()} />);

    expect(screen.getByText("1 source")).toBeTruthy();
    expect(screen.getByText("0 need attention")).toBeTruthy();
    expect(screen.getByText("1 healthy")).toBeTruthy();

    const url = screen.getByText(URL);
    expect(url.closest("a")).toBeNull();
    const row = url.closest("li");
    expect(row?.className).toContain("border-l-transparent");
    expect(row?.className).not.toContain("border-l-status-warning");
    expect(row?.textContent).toContain("official");
    expect(row?.textContent).toContain("Active");
    expect(row?.textContent).toContain("Last checked 2026-11-07 12:00:00 UTC.");
    expect(row?.textContent).toContain(
      "Prices unchanged. 2026-11-07 12:00:00 UTC. HTTP status: 200.",
    );
    expect(row?.textContent).toContain("Archived.");
    expect(screen.queryByText(/Note:/)).toBeNull();
  });

  it("marks a failed download with an amber border and keeps the note", () => {
    render(
      <SourceHealthList
        view={view({
          entries: [
            entry({
              outcomeText: "The download failed",
              httpStatusText: "no HTTP status",
              note: "network down",
              archiveText: "Archive failed. The stored copy remains.",
              warning: "No checker is wired to this URL.",
            }),
          ],
        })}
      />,
    );

    const row = screen.getByText(URL).closest("li");
    expect(row?.className).toContain("border-l-status-warning");
    expect(row?.className).not.toContain("border-l-transparent");
    expect(row?.textContent).toContain(
      "The download failed. 2026-11-07 12:00:00 UTC. No HTTP status.",
    );
    expect(row?.textContent).toContain("Note: network down");
    expect(row?.textContent).toContain("Archive failed. The stored copy remains.");
    expect(row?.textContent).toContain("No checker is wired to this URL.");
    expect(screen.getByText("1 needs attention")).toBeTruthy();
    expect(screen.getByText("0 healthy")).toBeTruthy();
  });

  it("shows the empty sentence and a missing-checker warning when nothing is stored", () => {
    const warning =
      "The schedule looks up a URL that is not in the database: https://example.test/missing";
    render(
      <SourceHealthList
        view={{
          missingCheckerWarnings: [warning],
          entries: [],
        }}
      />,
    );

    expect(screen.getByText("No sources are tracked yet.")).toBeTruthy();
    const line = screen.getByText(warning);
    expect(line.closest("li")?.className).toContain("border-l-status-warning");
    expect(screen.getByText("0 sources")).toBeTruthy();
    expect(screen.getByText("1 needs attention")).toBeTruthy();
    expect(screen.getByText("0 healthy")).toBeTruthy();
    expect(screen.queryByRole("link", { name: /https:/ })).toBeNull();
  });

  it("keeps a quiet changed price next to an inactive row", () => {
    render(
      <SourceHealthList
        view={view({
          entries: [
            entry({
              url: "https://example.test/changed",
              outcomeText: "Parsed prices changed",
            }),
            entry({
              url: "https://example.test/inactive",
              activeText: "Inactive",
            }),
          ],
        })}
      />,
    );

    const changed = screen.getByText("https://example.test/changed").closest("li");
    const inactive = screen.getByText("https://example.test/inactive").closest("li");
    expect(changed?.className).toContain("border-l-transparent");
    expect(changed?.textContent).toContain("Parsed prices changed");
    expect(inactive?.className).toContain("border-l-status-warning");
    expect(inactive?.textContent).toContain("Inactive");
    expect(screen.getByText("2 sources")).toBeTruthy();
    expect(screen.getByText("1 needs attention")).toBeTruthy();
    expect(screen.getByText("1 healthy")).toBeTruthy();
  });

  it("says a source with no check has not been checked yet", () => {
    render(
      <SourceHealthList
        view={view({
          entries: [
            entry({
              lastCheckedText: "Not checked yet.",
              outcomeText: null,
              checkedAtText: null,
              httpStatusText: null,
              archiveText: "No snapshot yet.",
            }),
          ],
        })}
      />,
    );

    expect(screen.getByText("Not checked yet.")).toBeTruthy();
    expect(screen.queryByText(/Last checked/)).toBeNull();
    expect(screen.getByText("No snapshot yet.")).toBeTruthy();
    expect(screen.getByText("1 healthy")).toBeTruthy();
  });
});
