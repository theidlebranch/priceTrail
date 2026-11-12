import { describe, expect, it } from "vitest";
import {
  parseBoardFilter,
  parseHistoryCursor,
  parseSourceId,
  toSourceBoardView,
  toSourceDetailView,
} from "./source-health";
import type {
  SourceCheckRow,
  SourceHealthRow,
  SourceHealthStats,
  SourceObservationRef,
  SourceSummary,
} from "@/server/db/repositories/source-health";

const ANTHROPIC = "https://platform.claude.com/docs/en/about-claude/pricing.md";
const OPENAI = "https://developers.openai.com/api/docs/pricing.md";
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
    url: ANTHROPIC,
    type: "official",
    active: true,
    lastCheckedAt: CHECKED,
    checks: [check()],
    latestSnapshot: null,
    latestChangeAt: null,
    ...overrides,
  };
}

function stats(overrides: Partial<SourceHealthStats> = {}): SourceHealthStats {
  return {
    checkCount: 1,
    okCount: 1,
    firstCheckId: 10,
    firstCheckAt: CHECKED,
    pendingCount: 0,
    archivedCount: 0,
    failedCount: 0,
    latestChangeAt: null,
    latestChangeObservationId: null,
    ...overrides,
  };
}

const SOURCE: SourceSummary = {
  id: 4,
  url: ANTHROPIC,
  type: "official",
  active: true,
};

describe("toSourceBoardView", () => {
  it("labels a quiet source in UTC and relative time", () => {
    const view = toSourceBoardView([row()], [ANTHROPIC], "all", NOW);

    expect(view.entries[0]).toMatchObject({
      href: "/review/sources/4",
      host: "platform.claude.com",
      path: "/docs/en/about-claude/pricing.md",
      status: "healthy",
      reason: "Prices unchanged",
      scheduleNote: null,
      lastCheck: {
        relative: "5h ago",
        absolute: "2026-11-07 12:00:00 UTC",
        dateTime: CHECKED.toISOString(),
      },
      lastChange: null,
      snapshot: { kind: "none" },
    });
    expect(view.summary.successText).toBe("100%");
    expect(view.summary.okCount).toBe(1);
    expect(view.summary.checkCount).toBe(1);
    expect(view.summary.newestCheck).toMatchObject({
      relative: "5h ago",
      short: "Nov 7 · 12:00",
      clock: "12:00",
      date: "Nov 7",
    });
    expect(view.summary.nextText).toBe("Nov 7 · next ≈ 18:00");
    expect(view.counts).toEqual({ all: 1, attention: 0, healthy: 1 });
  });

  it("sorts attention, unchecked, healthy, then paused, and filters without changing the counts", () => {
    const view = toSourceBoardView(
      [
        row({
          id: 2,
          url: "https://example.test/healthy",
          checks: [check({ id: 20 })],
        }),
        row({
          id: 3,
          url: "https://example.test/paused",
          active: false,
          checks: [check({ id: 30, outcome: "fetch_error", httpStatus: null, note: "down" })],
        }),
        row({
          id: 1,
          url: "https://b.example.test/attention",
          checks: [check({ id: 11, outcome: "fetch_error", httpStatus: null, note: "down" })],
          latestSnapshot: null,
        }),
        row({
          id: 5,
          url: "https://a.example.test/attention",
          checks: [check({ id: 12, outcome: "parser_suspect", note: "0 tables" })],
        }),
        row({
          id: 4,
          url: "https://example.test/new",
          active: true,
          lastCheckedAt: null,
          checks: [],
        }),
      ],
      [],
      "attention",
      NOW,
    );

    expect(view.entries.map((entry) => entry.host)).toEqual(["a.example.test", "b.example.test"]);
    expect(view.counts).toEqual({ all: 5, attention: 2, healthy: 1 });
    expect(view.summary.attentionNames).toEqual(["a.example.test", "b.example.test"]);
    expect(view.summary.activeCount).toBe(4);
    expect(view.summary.pausedCount).toBe(1);
    expect(view.entries.every((entry) => entry.status === "attention")).toBe(true);

    const all = toSourceBoardView(
      [
        row({ id: 2, url: "https://example.test/healthy" }),
        row({ id: 3, url: "https://example.test/paused", active: false }),
        row({ id: 4, url: "https://example.test/new", lastCheckedAt: null, checks: [] }),
        row({
          id: 1,
          url: "https://example.test/attention",
          checks: [check({ outcome: "fetch_error", httpStatus: null, note: "down" })],
        }),
      ],
      [],
      "all",
      NOW,
    );
    expect(all.entries.map((entry) => entry.status)).toEqual([
      "attention",
      "unchecked",
      "healthy",
      "paused",
    ]);
  });

  it("keeps schedule warnings off the health status, and leaves paused out of the percent", () => {
    const extra = "https://example.test/extra";
    const quiet = "https://example.test/quiet";
    const view = toSourceBoardView(
      [
        row({ url: OPENAI, active: false }),
        row({ id: 8, url: extra, type: "aggregator" }),
        row({ id: 9, url: quiet }),
      ],
      [ANTHROPIC, OPENAI, extra],
      "all",
      NOW,
    );

    expect(view.missingCheckerWarnings).toEqual([
      `The schedule looks up a URL that is not in the database: ${ANTHROPIC}`,
    ]);
    expect(view.entries.find((entry) => entry.url === extra)).toMatchObject({
      status: "healthy",
      scheduleNote: "The next visit will stop before download.",
    });
    expect(view.entries.find((entry) => entry.url === quiet)).toMatchObject({
      status: "healthy",
      scheduleNote: "No checker is wired to this URL.",
    });
    expect(view.entries.find((entry) => entry.url === OPENAI)).toMatchObject({
      status: "paused",
      scheduleNote: "The next visit will stop before download.",
    });
    expect(view.counts.attention).toBe(0);
    expect(view.summary.successText).toBe("100%");
  });

  it("renders a dash when active sources have no checks", () => {
    const view = toSourceBoardView(
      [
        row({ lastCheckedAt: null, checks: [] }),
        row({
          id: 9,
          url: "https://example.test/paused",
          active: false,
          checks: [check({ id: 9, outcome: "fetch_error", httpStatus: null, note: "down" })],
        }),
      ],
      [ANTHROPIC],
      "healthy",
      NOW,
    );

    expect(view.summary.successText).toBe("—");
    expect(view.entries).toHaveLength(0);
    expect(view.counts).toEqual({ all: 2, attention: 0, healthy: 0 });
  });

  it("says prices changed from the older change, not from the strip alone", () => {
    const changedAt = new Date("2026-11-05T17:00:00.000Z");
    const view = toSourceBoardView(
      [
        row({
          latestChangeAt: changedAt,
          latestSnapshot: {
            id: 40,
            archiveStatus: "archived",
            archiveUrl: null,
            fetchedAt: changedAt,
          },
        }),
      ],
      [ANTHROPIC],
      "all",
      NOW,
    );

    expect(view.entries[0]?.reason).toBe("Prices changed 2d ago");
    expect(view.entries[0]?.lastChange?.absolute).toBe("2026-11-05 17:00:00 UTC");
    expect(view.entries[0]?.snapshot.kind).toBe("archived");
  });

  it("returns no entries when no sources are stored", () => {
    expect(toSourceBoardView([], [], "all", NOW).entries).toEqual([]);
  });

  it("throws when the url is blank", () => {
    expect(() => toSourceBoardView([row({ url: "  " })], [], "all", NOW)).toThrow(/source url/);
  });

  it("throws when the outcome is not one this page can explain", () => {
    expect(() =>
      toSourceBoardView(
        [row({ checks: [check({ outcome: "guessed" })] })],
        [],
        "all",
        NOW,
      ),
    ).toThrow(/guessed/);
  });

  it("throws when the source type is not a known page kind", () => {
    expect(() => toSourceBoardView([row({ type: "blog" })], [], "all", NOW)).toThrow(/blog/);
  });

  it("throws when the archive status is not a known ending", () => {
    expect(() =>
      toSourceBoardView(
        [
          row({
            latestSnapshot: {
              id: 3,
              archiveStatus: "missing",
              archiveUrl: null,
              fetchedAt: CHECKED,
            },
          }),
        ],
        [],
        "all",
        NOW,
      ),
    ).toThrow(/missing/);
  });

  it("throws when a failed check was stored without a note", () => {
    expect(() =>
      toSourceBoardView(
        [row({ checks: [check({ outcome: "parser_suspect", note: "   " })] })],
        [],
        "all",
        NOW,
      ),
    ).toThrow(/note/);
    expect(() =>
      toSourceBoardView(
        [row({ checks: [check({ outcome: "fetch_error", httpStatus: null, note: null })] })],
        [],
        "all",
        NOW,
      ),
    ).toThrow(/note/);
  });

  it("throws when the last-checked time and the latest check disagree about whether a check exists", () => {
    expect(() => toSourceBoardView([row({ checks: [] })], [], "all", NOW)).toThrow(/last checked/);
    expect(() => toSourceBoardView([row({ lastCheckedAt: null })], [], "all", NOW)).toThrow(
      /last checked/,
    );
  });

  it("throws when a successful check has no HTTP status, or a status outside 200-299", () => {
    expect(() =>
      toSourceBoardView([row({ checks: [check({ httpStatus: null })] })], [], "all", NOW),
    ).toThrow(/HTTP status/);
    expect(() =>
      toSourceBoardView(
        [row({ checks: [check({ outcome: "changed", httpStatus: 500, observationId: 3, archiveStatus: "archived" })] })],
        [],
        "all",
        NOW,
      ),
    ).toThrow(/200-299/);
  });

  it("throws when a checker url is blank or repeated", () => {
    expect(() => toSourceBoardView([], ["  "], "all", NOW)).toThrow(/checker url/);
    expect(() => toSourceBoardView([], [ANTHROPIC, ANTHROPIC], "all", NOW)).toThrow(/share/);
  });

  it("throws when two stored rows share one url", () => {
    expect(() => toSourceBoardView([row(), row()], [ANTHROPIC], "all", NOW)).toThrow(
      new RegExp(ANTHROPIC),
    );
  });

  it("throws when a time is not a real date", () => {
    expect(() => toSourceBoardView([row({ lastCheckedAt: new Date("nope") })], [], "all", NOW)).toThrow(
      /last checked/,
    );
  });
});

describe("parseBoardFilter", () => {
  it("treats an unknown status as the full list", () => {
    expect(parseBoardFilter(undefined)).toBe("all");
    expect(parseBoardFilter("paused")).toBe("all");
    expect(parseBoardFilter("nope")).toBe("all");
    expect(parseBoardFilter("attention")).toBe("attention");
    expect(parseBoardFilter("healthy")).toBe("healthy");
  });
});

describe("toSourceDetailView", () => {
  it("groups a run, leaves a check with no snapshot muted, and chips a shared capture", () => {
    const shared = "https://web.archive.org/web/example/prices";
    const older: SourceObservationRef = {
      id: 580,
      archiveUrl: shared,
      fetchedAt: new Date("2026-11-01T12:00:00.000Z"),
      archiveStatus: "archived",
    };
    const later: SourceObservationRef = {
      id: 581,
      archiveUrl: shared,
      fetchedAt: CHECKED,
      archiveStatus: "failed",
      };
    const view = toSourceDetailView(
      SOURCE,
      stats({
        checkCount: 4,
        okCount: 3,
        firstCheckId: 7,
        firstCheckAt: new Date("2026-11-01T12:00:00.000Z"),
        failedCount: 1,
        archivedCount: 1,
        latestChangeAt: CHECKED,
        latestChangeObservationId: 581,
      }),
      [
        check({ id: 10, outcome: "unchanged" }),
        check({ id: 9, outcome: "unchanged" }),
        check({ id: 8, outcome: "unchanged" }),
      ],
      [
        check({ id: 10, outcome: "unchanged" }),
        check({ id: 9, outcome: "unchanged" }),
        check({ id: 8, outcome: "unchanged" }),
        check({
          id: 7,
          outcome: "changed",
          fetchedAt: new Date("2026-11-01T12:00:00.000Z"),
          observationId: 581,
          archiveStatus: "failed",
          archiveUrl: shared,
          note: "new prices",
        }),
      ],
      [older, later],
      NOW,
    );

    expect(view.status).toBe("attention");
    expect(view.reason).toBe("Wayback failed · stored copy kept");
    expect(view.scheduleLabel).toBe("Active · every 6h");
    expect(view.history[0]).toMatchObject({
      kind: "group",
      count: 3,
      outcomeLabel: "Unchanged",
      note: null,
    });
    expect(view.history[1]).toMatchObject({
      kind: "single",
      changed: true,
      firstCheck: true,
      wayback: {
        kind: "failed",
        id: 581,
        chips: ["same capture as #580"],
      },
    });
    expect(view.stats.successText).toBe("75%");
    expect(view.stats.lastChange?.snapshotId).toBe(581);
    expect(view.emptyHistoryText).toBeNull();
    expect(view.olderHref).toBeNull();
  });

  it("links older checks when the page is full", () => {
    const page = Array.from({ length: 50 }, (_, index) =>
      check({
        id: 100 - index,
        fetchedAt: new Date(CHECKED.getTime() - index * 3_600_000),
      }),
    );
    const view = toSourceDetailView(
      SOURCE,
      stats({
        checkCount: 80,
        okCount: 80,
        firstCheckId: 1,
        firstCheckAt: new Date("2026-10-01T00:00:00.000Z"),
      }),
      page.slice(0, 24),
      page,
      [],
      NOW,
    );

    expect(view.olderHref).toBe(
      `/review/sources/4?before=${encodeURIComponent(page[49]?.fetchedAt.toISOString() ?? "")}&beforeId=51`,
    );
    expect(view.history[0]?.kind).toBe("group");
    if (view.history[0]?.kind === "group") {
      expect(view.history[0].shown).toHaveLength(20);
      expect(view.history[0].hidden).toHaveLength(30);
      expect(view.history[0].showMoreLabel).toBe("Show more");
    }
  });

  it("says a source with no checks has not been checked", () => {
    const view = toSourceDetailView(
      SOURCE,
      stats({
        checkCount: 0,
        okCount: 0,
        firstCheckId: null,
        firstCheckAt: null,
      }),
      [],
      [],
      [],
      NOW,
    );

    expect(view.status).toBe("unchecked");
    expect(view.emptyHistoryText).toBe("This source has not been checked yet.");
    expect(view.stats.successText).toBe("—");
  });
});

describe("parseHistoryCursor", () => {
  it("reads a time and an id, and rejects half a cursor", () => {
    expect(parseHistoryCursor(undefined, undefined)).toBeNull();
    expect(parseHistoryCursor(CHECKED.toISOString(), "12")).toEqual({
      fetchedAt: CHECKED,
      id: 12,
    });
    expect(() => parseHistoryCursor(CHECKED.toISOString(), undefined)).toThrow(/cursor/);
    expect(() => parseHistoryCursor(undefined, "12")).toThrow(/cursor/);
    expect(() => parseHistoryCursor("nope", "12")).toThrow(/real date/);
  });
});

describe("parseSourceId", () => {
  it("reads a whole number", () => {
    expect(parseSourceId("4")).toBe(4);
  });

  it("throws when the id is not a whole number", () => {
    expect(() => parseSourceId("01")).toThrow(/whole number/);
    expect(() => parseSourceId("nope")).toThrow(/whole number/);
    expect(() => parseSourceId("1e2")).toThrow(/whole number/);
  });
});
