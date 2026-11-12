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
    id: 4,
    href: "/review/sources/4",
    url: URL,
    typeText: "official",
    activeText: "Active",
    lastCheckedText: "2026-11-07 12:00:00 UTC",
    visitColor: "ok",
    outcomeText: "Prices unchanged",
    checkedAtText: "2026-11-07 12:00:00 UTC",
    httpStatusText: "200",
    note: null,
    archiveColor: "ok",
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
    expect(screen.queryByRole("heading", { name: "Visit" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Wayback" })).toBeNull();
  });
});

describe("SourceHealthList", () => {
  it("links a quiet source to its history and colors the visit and the archive", () => {
    render(<SourceHealthList view={view()} />);

    expect(screen.getByText("1 source")).toBeTruthy();
    expect(screen.getByText("0 need attention")).toBeTruthy();
    expect(screen.getByText("1 healthy")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Visit" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Wayback" })).toBeTruthy();
    expect(screen.getByText("Prices unchanged.")).toBeTruthy();
    expect(screen.getByText("Parsed prices changed.")).toBeTruthy();
    expect(screen.getByText("The parser could not read the page.")).toBeTruthy();
    expect(screen.getByText("The download failed.")).toBeTruthy();
    expect(screen.getByText("Not checked yet.")).toBeTruthy();
    expect(screen.getAllByText("Archived.").length).toBeGreaterThan(1);
    expect(screen.getByText("Archive is still pending.")).toBeTruthy();
    expect(screen.getByText("Archive failed. The stored copy remains.")).toBeTruthy();
    expect(screen.getByText("Wayback was not asked.")).toBeTruthy();

    const link = screen.getByRole("link", { name: new RegExp(URL) });
    expect(link.getAttribute("href")).toBe("/review/sources/4");
    expect(link.className).toContain("border-l-status-ok");
    expect(link.className).not.toContain("border-l-status-warning");
    expect(link.textContent).toContain("official");
    expect(link.textContent).toContain("Active");
    expect(link.textContent).toContain("Last checked 2026-11-07 12:00:00 UTC.");
    expect(link.textContent).toContain(
      "Prices unchanged. 2026-11-07 12:00:00 UTC. HTTP status: 200.",
    );
    const archived = screen.getAllByText("Archived.").find((node) => node.closest("a") === link);
    expect(archived?.className).toContain("text-status-ok");
    expect(screen.queryByText(/^Note:/)).toBeNull();
  });

  it("marks a failed download in red and a failed archive in red", () => {
    render(
      <SourceHealthList
        view={view({
          entries: [
            entry({
              visitColor: "error",
              outcomeText: "The download failed",
              httpStatusText: "no HTTP status",
              note: "network down",
              archiveColor: "error",
              archiveText: "Archive failed. The stored copy remains.",
              warning: "No checker is wired to this URL.",
            }),
          ],
        })}
      />,
    );

    const link = screen.getByRole("link", { name: new RegExp(URL) });
    expect(link.className).toContain("border-l-status-error");
    expect(link.className).not.toContain("border-l-status-warning");
    expect(link.textContent).toContain(
      "The download failed. 2026-11-07 12:00:00 UTC. No HTTP status.",
    );
    expect(link.textContent).toContain("Note: network down");
    expect(link.textContent).toContain("Archive failed. The stored copy remains.");
    expect(link.textContent).toContain("No checker is wired to this URL.");
    const archive = screen
      .getAllByText("Archive failed. The stored copy remains.")
      .find((node) => node.closest("a") === link);
    expect(archive?.className).toContain("text-status-error");
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

  it("colors a changed visit blue and leaves an inactive visit on its own color", () => {
    render(
      <SourceHealthList
        view={view({
          entries: [
            entry({
              id: 8,
              href: "/review/sources/8",
              url: "https://example.test/changed",
              visitColor: "info",
              outcomeText: "Parsed prices changed",
            }),
            entry({
              id: 9,
              href: "/review/sources/9",
              url: "https://example.test/inactive",
              activeText: "Inactive",
            }),
          ],
        })}
      />,
    );

    const changed = screen.getByRole("link", { name: /example\.test\/changed/ });
    const inactive = screen.getByRole("link", { name: /example\.test\/inactive/ });
    expect(changed.getAttribute("href")).toBe("/review/sources/8");
    expect(changed.className).toContain("border-l-status-info");
    expect(changed.textContent).toContain("Parsed prices changed");
    expect(inactive.className).toContain("border-l-status-ok");
    expect(inactive.className).not.toContain("border-l-status-warning");
    expect(inactive.textContent).toContain("Inactive");
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
              visitColor: "neutral",
              lastCheckedText: "Not checked yet.",
              outcomeText: null,
              checkedAtText: null,
              httpStatusText: null,
              archiveColor: "neutral",
              archiveText: "No snapshot yet.",
            }),
          ],
        })}
      />,
    );

    const link = screen.getByRole("link", { name: new RegExp(URL) });
    expect(link.className).toContain("border-l-status-neutral");
    expect(link.textContent).toContain("Not checked yet.");
    expect(link.textContent).not.toContain("Last checked");
    const archive = screen.getAllByText("No snapshot yet.").find((node) => node.closest("a") === link);
    expect(archive?.className).toContain("text-status-neutral");
    expect(screen.getByText("1 healthy")).toBeTruthy();
  });
});
