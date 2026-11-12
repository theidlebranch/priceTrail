import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { toSourceBoardView, toSourceDetailView } from "@/app/review/source-health";
import { SourceDetail } from "@/components/source-health/source-detail";
import { SourcesBoard } from "@/components/source-health/sources-board";
import type {
  SourceCheckRow,
  SourceHealthRow,
  SourceHealthStats,
  SourceObservationRef,
  SourceSummary,
} from "@/server/db/repositories/source-health";

afterEach(() => {
  cleanup();
});

const NOW = new Date("2026-11-07T17:00:00.000Z");
const CHECKED = new Date("2026-11-07T12:00:00.000Z");

function check(overrides: Partial<SourceCheckRow> = {}): SourceCheckRow {
  return {
    id: 10,
    fetchedAt: CHECKED,
    httpStatus: 200,
    outcome: "unchanged",
    note: null,
    observationId: null,
    archiveStatus: null,
    archiveUrl: null,
    ...overrides,
  };
}

function row(overrides: Partial<SourceHealthRow> = {}): SourceHealthRow {
  return {
    id: 4,
    url: "https://healthy.example/prices",
    type: "official",
    active: true,
    lastCheckedAt: CHECKED,
    checks: [check()],
    latestSnapshot: null,
    latestChangeAt: null,
    ...overrides,
  };
}

describe("SourcesBoard", () => {
  it("shows a healthy source, a parser failure, a download failure, an unchecked source, and a paused source", () => {
    const healthy = "https://healthy.example/prices";
    const parser = "https://parser.example/prices";
    const download = "https://download.example/prices";
    const fresh = "https://new.example/prices";
    const paused = "https://paused.example/prices";
    render(
      <SourcesBoard
        view={toSourceBoardView(
          [
            row({ id: 1, url: healthy }),
            row({
              id: 2,
              url: parser,
              checks: [check({ id: 2, outcome: "parser_suspect", note: "0 matching tables" })],
            }),
            row({
              id: 3,
              url: download,
              checks: [check({ id: 3, outcome: "fetch_error", httpStatus: null, note: "network down" })],
            }),
            row({ id: 4, url: fresh, lastCheckedAt: null, checks: [] }),
            row({ id: 5, url: paused, active: false }),
          ],
          [healthy, parser, download, fresh, paused],
          "all",
          NOW,
        )}
      />,
    );

    expect(screen.getByRole("heading", { level: 1, name: "Sources" })).toBeTruthy();
    expect(screen.getByText(/A warning here never publishes a price/)).toBeTruthy();
    expect(screen.getByText("All times UTC")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Review queue" }).getAttribute("href")).toBe("/review");
    expect(screen.getByRole("heading", { name: "Latest run" })).toBeTruthy();
    expect(screen.getByText("Nov 7 · next ≈ 18:00")).toBeTruthy();
    expect(screen.getByText("1 of 3 checks")).toBeTruthy();

    expect(rowText(healthy)).toContain("Prices unchanged");
    expect(rowText(parser)).toContain("Parser failed");
    expect(rowText(download)).toContain("Download failed");
    expect(rowText(fresh)).toContain("Not checked yet");
    expect(rowText(paused)).toContain("Paused");
    expect(detailLink(healthy).getAttribute("href")).toBe("/review/sources/1");
    expect(detailLink(parser).getAttribute("href")).toBe("/review/sources/2");
    expect(detailLink(download).getAttribute("href")).toBe("/review/sources/3");
    expect(detailLink(fresh).getAttribute("href")).toBe("/review/sources/4");
    expect(detailLink(paused).getAttribute("href")).toBe("/review/sources/5");
    expect(screen.getAllByRole("img").length).toBe(5);
    expect(screen.getByRole("link", { name: "Needs attention 2" }).getAttribute("href")).toBe(
      "/review/sources?status=attention",
    );
  });

  it("says when the catalog is empty, and when a filter matches nothing", () => {
    const empty = toSourceBoardView([], ["https://example.test/missing"], "all", NOW);
    const { unmount } = render(<SourcesBoard view={empty} />);
    expect(screen.getByText("No sources are tracked yet.")).toBeTruthy();
    expect(screen.getByText(/not in the database/)).toBeTruthy();
    unmount();

    render(
      <SourcesBoard
        view={toSourceBoardView(
          [row({ checks: [check({ outcome: "fetch_error", httpStatus: null, note: "down" })] })],
          [],
          "healthy",
          NOW,
        )}
      />,
    );
    expect(screen.getByText("No sources match this filter.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Healthy 0" }).getAttribute("aria-current")).toBe("page");
    expect(
      screen.getByText(
        "Wayback: archived, pending, or failed. A snapshot is stored when the parsed page changes, even when today's price already matches the site.",
      ),
    ).toBeTruthy();
    expect(screen.getByText("Changed").closest("li")?.getAttribute("title")).toBe(
      "The parsed page changed, so that check stored a snapshot. The price on the site may be the same.",
    );
  });

  it("keeps the archive permalink outside the detail link", () => {
    const archiveUrl = "https://web.archive.org/web/20261107120000/https://healthy.example/prices";
    render(
      <SourcesBoard
        view={toSourceBoardView(
          [
            row({
              latestSnapshot: {
                id: 40,
                archiveStatus: "archived",
                archiveUrl,
                fetchedAt: CHECKED,
              },
            }),
          ],
          ["https://healthy.example/prices"],
          "all",
          NOW,
        )}
      />,
    );

    const detail = detailLink("https://healthy.example/prices");
    const archive = screen.getByRole("link", { name: "#40" });
    expect(detail.getAttribute("href")).toBe("/review/sources/4");
    expect(archive.getAttribute("href")).toBe(archiveUrl);
    expect(archive.getAttribute("target")).toBe("_blank");
    expect(detail.contains(archive)).toBe(false);
    expect(archive.closest("a")).toBe(archive);
  });
});

describe("SourceDetail", () => {
  it("shows a history group, a check with no snapshot, and a shared capture chip", () => {
    const shared = "https://web.archive.org/save/https://healthy.example/prices";
    const older: SourceObservationRef = {
      id: 580,
      archiveUrl: shared,
      fetchedAt: new Date("2026-11-01T12:00:00.000Z"),
      archiveStatus: "archived",
    };
    const later: SourceObservationRef = {
      id: 581,
      archiveUrl: shared,
      fetchedAt: new Date("2026-11-06T12:00:00.000Z"),
      archiveStatus: "archived",
    };
    const source: SourceSummary = {
      id: 4,
      url: "https://healthy.example/prices",
      type: "official",
      active: true,
    };
    const page = [
      check({ id: 12, outcome: "parser_suspect", note: "0 matching tables" }),
      check({ id: 11 }),
      check({ id: 10, fetchedAt: new Date("2026-11-07T06:00:00.000Z") }),
      check({ id: 9, fetchedAt: new Date("2026-11-07T00:00:00.000Z") }),
      check({
        id: 7,
        outcome: "changed",
        fetchedAt: new Date("2026-11-06T12:00:00.000Z"),
        note: "new prices",
        observationId: 581,
        archiveStatus: "archived",
        archiveUrl: shared,
      }),
    ];
    render(
      <SourceDetail
        view={toSourceDetailView(
          source,
          {
            checkCount: 5,
            okCount: 4,
            firstCheckId: 7,
            firstCheckAt: new Date("2026-11-06T12:00:00.000Z"),
            pendingCount: 0,
            archivedCount: 2,
            failedCount: 0,
            latestChangeAt: new Date("2026-11-06T12:00:00.000Z"),
            latestChangeObservationId: 581,
          } satisfies SourceHealthStats,
          page.slice(0, 4),
          page,
          [older, later],
          NOW,
        )}
      />,
    );

    expect(screen.getByRole("heading", { name: "healthy.example" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open page" }).getAttribute("rel")).toContain("noreferrer");
    expect(screen.getByRole("heading", { name: "Parser failed" })).toBeTruthy();
    expect(screen.getByText(/The site answered with HTTP 200/)).toBeTruthy();
    expect(screen.getByText("×3")).toBeTruthy();
    expect(screen.getAllByText("No snapshot").length).toBeGreaterThan(0);
    expect(screen.getByText("same capture as #580")).toBeTruthy();
    expect(screen.getByText("first check")).toBeTruthy();
    expect(
      screen.getAllByText("0 matching tables").some((node) => node.classList.contains("break-all")),
    ).toBe(true);
  });

  it("reveals the rest of a long group without changing the times", () => {
    const page = Array.from({ length: 25 }, (_, index) =>
      check({
        id: 40 - index,
        fetchedAt: new Date(CHECKED.getTime() - index * 3_600_000),
      }),
    );
    const hidden = page[20];
    const oldest = page[24];
    if (hidden === undefined || oldest === undefined) {
      throw new Error("the long group needs a hidden check");
    }
    const { container } = render(
      <SourceDetail
        view={toSourceDetailView(
          {
            id: 4,
            url: "https://healthy.example/prices",
            type: "official",
            active: true,
          },
          {
            checkCount: 25,
            okCount: 25,
            firstCheckId: oldest.id,
            firstCheckAt: oldest.fetchedAt,
            pendingCount: 0,
            archivedCount: 0,
            failedCount: 0,
            latestChangeAt: null,
            latestChangeObservationId: null,
          },
          page.slice(0, 24),
          page,
          [],
          NOW,
        )}
      />,
    );

    const stamp = hidden.fetchedAt.toISOString();
    expect(container.querySelectorAll(`time[datetime="${stamp}"]`)).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Show more" }));
    expect(container.querySelectorAll(`time[datetime="${stamp}"]`)).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Show more" })).toBeNull();
  });
});

function detailLink(url: string): HTMLElement {
  const host = new URL(url).host.replaceAll(".", "\\.");
  return screen.getByRole("link", { name: new RegExp(host) });
}

function rowText(url: string): string {
  return detailLink(url).closest("div")?.textContent ?? "";
}
