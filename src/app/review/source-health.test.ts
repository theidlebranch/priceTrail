import { describe, expect, it } from "vitest";
import {
  parseSourceId,
  sourceEntryNeedsAttention,
  summarizeSourceHealth,
  toSourceHealthView,
  toSourceHistoryView,
  type SourceHealthEntry,
  type SourceHealthRow,
} from "./source-health";
import type { SourceCheckRow, SourceSummary } from "@/server/db/repositories/source-health";

const ANTHROPIC = "https://platform.claude.com/docs/en/about-claude/pricing.md";
const OPENAI = "https://developers.openai.com/api/docs/pricing.md";
const CHECKED = new Date("2026-11-07T12:00:00.000Z");

function row(overrides: Partial<SourceHealthRow> = {}): SourceHealthRow {
  return {
    id: 4,
    url: ANTHROPIC,
    type: "official",
    active: true,
    lastCheckedAt: CHECKED,
    latestCheck: {
      outcome: "unchanged",
      fetchedAt: CHECKED,
      httpStatus: 200,
      note: null,
    },
    archiveStatus: "archived",
    ...overrides,
  };
}

describe("toSourceHealthView", () => {
  it("describes a quiet official page that still has an archive", () => {
    expect(toSourceHealthView([row()], [ANTHROPIC])).toEqual({
      missingCheckerWarnings: [],
      entries: [
        {
          id: 4,
          href: "/review/sources/4",
          url: ANTHROPIC,
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
        },
      ],
    });
  });

  it("says a source with no check and no snapshot has not been checked", () => {
    const view = toSourceHealthView(
      [row({ lastCheckedAt: null, latestCheck: null, archiveStatus: null })],
      [ANTHROPIC],
    );

    expect(view.entries[0]).toMatchObject({
      lastCheckedText: "Not checked yet.",
      visitColor: "neutral",
      outcomeText: null,
      checkedAtText: null,
      httpStatusText: null,
      note: null,
      archiveColor: "neutral",
      archiveText: "No snapshot yet.",
      warning: null,
    });
  });

  it("shows a seeded snapshot that has not been checked yet", () => {
    const view = toSourceHealthView(
      [row({ lastCheckedAt: null, latestCheck: null, archiveStatus: "pending" })],
      [ANTHROPIC],
    );

    expect(view.entries[0]).toMatchObject({
      lastCheckedText: "Not checked yet.",
      visitColor: "neutral",
      outcomeText: null,
      checkedAtText: null,
      httpStatusText: null,
      note: null,
      archiveColor: "warning",
      archiveText: "Archive is still pending.",
      warning: null,
    });
  });

  it("keeps a stored note and names each outcome and archive status", () => {
    const view = toSourceHealthView(
      [
        row({
          url: "https://example.test/error",
          latestCheck: {
            outcome: "fetch_error",
            fetchedAt: CHECKED,
            httpStatus: null,
            note: "network down",
          },
          archiveStatus: null,
        }),
        row({
          url: "https://example.test/suspect",
          latestCheck: {
            outcome: "parser_suspect",
            fetchedAt: CHECKED,
            httpStatus: 200,
            note: "0 matching tables",
          },
          archiveStatus: "pending",
        }),
        row({
          url: "https://example.test/changed",
          latestCheck: {
            outcome: "changed",
            fetchedAt: CHECKED,
            httpStatus: 200,
            note: "kept",
          },
          archiveStatus: "failed",
        }),
      ],
      [ANTHROPIC],
    );

    expect(view.entries.map((entry) => entry.visitColor)).toEqual(["error", "warning", "info"]);
    expect(view.entries.map((entry) => entry.archiveColor)).toEqual(["neutral", "warning", "error"]);
    expect(view.entries.map((entry) => entry.outcomeText)).toEqual([
      "The download failed",
      "The parser could not read the page",
      "Parsed prices changed",
    ]);
    expect(view.entries.map((entry) => entry.httpStatusText)).toEqual([
      "no HTTP status",
      "200",
      "200",
    ]);
    expect(view.entries.map((entry) => entry.note)).toEqual([
      "network down",
      "0 matching tables",
      "kept",
    ]);
    expect(view.entries.map((entry) => entry.archiveText)).toEqual([
      "No snapshot yet.",
      "Archive is still pending.",
      "Archive failed. The stored copy remains.",
    ]);
    expect(view.entries.every((entry) => entry.warning === "No checker is wired to this URL.")).toBe(
      true,
    );
  });

  it("warns when a checker URL is missing, and when a wired page will not be downloaded", () => {
    const view = toSourceHealthView(
      [
        row({ url: OPENAI, active: false }),
        row({ url: "https://example.test/aggregator", type: "aggregator" }),
      ],
      [ANTHROPIC, OPENAI],
    );

    expect(view.missingCheckerWarnings).toEqual([
      `The schedule looks up a URL that is not in the database: ${ANTHROPIC}`,
    ]);
    expect(view.entries.map((entry) => entry.warning)).toEqual([
      "The next visit will stop before download.",
      "No checker is wired to this URL.",
    ]);
    expect(view.entries[0]?.activeText).toBe("Inactive");
  });

  it("returns no entries when no sources are stored", () => {
    expect(toSourceHealthView([], [])).toEqual({
      missingCheckerWarnings: [],
      entries: [],
    });
  });

  it("throws when the url is blank", () => {
    expect(() => toSourceHealthView([row({ url: "  " })], [])).toThrow(/source url/);
  });

  it("throws when the outcome is not one this page can explain", () => {
    expect(() =>
      toSourceHealthView(
        [
          row({
            latestCheck: {
              outcome: "guessed",
              fetchedAt: CHECKED,
              httpStatus: 200,
              note: null,
            },
          }),
        ],
        [],
      ),
    ).toThrow(/guessed/);
  });

  it("throws when the source type is not a known page kind", () => {
    expect(() => toSourceHealthView([row({ type: "blog" })], [])).toThrow(/blog/);
  });

  it("throws when the archive status is not a known ending", () => {
    expect(() => toSourceHealthView([row({ archiveStatus: "missing" })], [])).toThrow(/missing/);
  });

  it("throws when a failed check was stored without a note", () => {
    expect(() =>
      toSourceHealthView(
        [
          row({
            latestCheck: {
              outcome: "parser_suspect",
              fetchedAt: CHECKED,
              httpStatus: 200,
              note: "   ",
            },
          }),
        ],
        [],
      ),
    ).toThrow(/note/);
    expect(() =>
      toSourceHealthView(
        [
          row({
            latestCheck: {
              outcome: "fetch_error",
              fetchedAt: CHECKED,
              httpStatus: null,
              note: null,
            },
          }),
        ],
        [],
      ),
    ).toThrow(/note/);
  });

  it("throws when the last-checked time and the latest check disagree about whether a check exists", () => {
    expect(() => toSourceHealthView([row({ latestCheck: null })], [])).toThrow(/last checked/);
    expect(() => toSourceHealthView([row({ lastCheckedAt: null })], [])).toThrow(/last checked/);
  });

  it("throws when a successful check has no HTTP status, or a status outside 200-299", () => {
    expect(() =>
      toSourceHealthView(
        [
          row({
            latestCheck: {
              outcome: "unchanged",
              fetchedAt: CHECKED,
              httpStatus: null,
              note: null,
            },
          }),
        ],
        [],
      ),
    ).toThrow(/HTTP status/);
    expect(() =>
      toSourceHealthView(
        [
          row({
            latestCheck: {
              outcome: "changed",
              fetchedAt: CHECKED,
              httpStatus: 500,
              note: null,
            },
          }),
        ],
        [],
      ),
    ).toThrow(/200-299/);
  });

  it("throws when a checker url is blank or repeated", () => {
    expect(() => toSourceHealthView([], ["  "])).toThrow(/checker url/);
    expect(() => toSourceHealthView([], [ANTHROPIC, ANTHROPIC])).toThrow(/share/);
  });

  it("throws when two stored rows share one url", () => {
    expect(() => toSourceHealthView([row(), row()], [ANTHROPIC])).toThrow(new RegExp(ANTHROPIC));
  });

  it("throws when a time is not a real date", () => {
    expect(() => toSourceHealthView([row({ lastCheckedAt: new Date("nope") })], [])).toThrow(
      /last checked/,
    );
  });
});

function healthEntry(overrides: Partial<SourceHealthEntry> = {}): SourceHealthEntry {
  return {
    id: 4,
    href: "/review/sources/4",
    url: ANTHROPIC,
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

describe("sourceEntryNeedsAttention", () => {
  it("leaves a checked, archived, active page quiet", () => {
    expect(sourceEntryNeedsAttention(healthEntry())).toBe(false);
    expect(
      sourceEntryNeedsAttention(healthEntry({ outcomeText: "Parsed prices changed" })),
    ).toBe(false);
    expect(
      sourceEntryNeedsAttention(healthEntry({ archiveText: "Archive is still pending." })),
    ).toBe(false);
    expect(
      sourceEntryNeedsAttention(
        healthEntry({
          lastCheckedText: "Not checked yet.",
          outcomeText: null,
          checkedAtText: null,
          httpStatusText: null,
          archiveText: "No snapshot yet.",
        }),
      ),
    ).toBe(false);
  });

  it("flags a failed archive, a missing status, a bad read, an inactive row, and a warning", () => {
    expect(
      sourceEntryNeedsAttention(
        healthEntry({ archiveText: "Archive failed. The stored copy remains." }),
      ),
    ).toBe(true);
    expect(sourceEntryNeedsAttention(healthEntry({ httpStatusText: "no HTTP status" }))).toBe(true);
    expect(sourceEntryNeedsAttention(healthEntry({ outcomeText: "The download failed" }))).toBe(
      true,
    );
    expect(
      sourceEntryNeedsAttention(
        healthEntry({ outcomeText: "The parser could not read the page" }),
      ),
    ).toBe(true);
    expect(sourceEntryNeedsAttention(healthEntry({ activeText: "Inactive" }))).toBe(true);
    expect(
      sourceEntryNeedsAttention(healthEntry({ warning: "No checker is wired to this URL." })),
    ).toBe(true);
    expect(
      sourceEntryNeedsAttention(
        healthEntry({ warning: "The next visit will stop before download." }),
      ),
    ).toBe(true);
  });
});

describe("summarizeSourceHealth", () => {
  it("counts attention rows plus missing checkers, and leaves the other rows healthy", () => {
    expect(
      summarizeSourceHealth({
        missingCheckerWarnings: [
          "The schedule looks up a URL that is not in the database: https://example.test/missing",
        ],
        entries: [
          healthEntry(),
          healthEntry({
            url: "https://example.test/changed",
            outcomeText: "Parsed prices changed",
          }),
          healthEntry({
            url: "https://example.test/failed",
            archiveText: "Archive failed. The stored copy remains.",
          }),
        ],
      }),
    ).toEqual({ sources: 3, needsAttention: 2, healthy: 2 });
  });
});

const SOURCE: SourceSummary = {
  id: 4,
  url: ANTHROPIC,
  type: "official",
  active: true,
};

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

describe("toSourceHistoryView", () => {
  it("colors each visit and only asks Wayback when the parsed page changed", () => {
    const view = toSourceHistoryView(SOURCE, [
      check({ id: 10, outcome: "unchanged" }),
      check({
        id: 9,
        outcome: "fetch_error",
        httpStatus: null,
        note: "network down",
      }),
      check({ id: 8, outcome: "parser_suspect", note: "0 matching tables" }),
      check({
        id: 7,
        outcome: "changed",
        note: null,
        observationId: 313,
        archiveStatus: "archived",
        archiveUrl: "https://web.archive.org/web/1",
      }),
      check({
        id: 6,
        outcome: "changed",
        observationId: 200,
        archiveStatus: "pending",
      }),
      check({
        id: 5,
        outcome: "changed",
        note: "kept",
        observationId: 100,
        archiveStatus: "failed",
      }),
    ]);

    expect(view).toMatchObject({
      url: ANTHROPIC,
      typeText: "official",
      activeText: "Active",
    });
    expect(view.checks.map((entry) => entry.visitColor)).toEqual([
      "ok",
      "error",
      "warning",
      "info",
      "info",
      "info",
    ]);
    expect(view.checks.map((entry) => entry.archiveColor)).toEqual([
      "neutral",
      "neutral",
      "neutral",
      "ok",
      "warning",
      "error",
    ]);
    expect(view.checks.map((entry) => entry.archiveText)).toEqual([
      "Wayback was not asked.",
      "Wayback was not asked.",
      "Wayback was not asked.",
      "Archived.",
      "Archive is still pending.",
      "Archive failed. The stored copy remains.",
    ]);
    expect(view.checks.map((entry) => entry.outcomeText)).toEqual([
      "Prices unchanged",
      "The download failed",
      "The parser could not read the page",
      "Parsed prices changed",
      "Parsed prices changed",
      "Parsed prices changed",
    ]);
    expect(view.checks[1]).toMatchObject({
      httpStatusText: "no HTTP status",
      note: "network down",
      snapshotText: null,
      archiveUrl: null,
    });
    expect(view.checks[3]).toMatchObject({
      snapshotText: "Snapshot 313.",
      archiveUrl: "https://web.archive.org/web/1",
      checkedAtText: "2026-11-07 12:00:00 UTC",
    });
    expect(view.checks[0]?.snapshotText).toBeNull();
  });

  it("returns no visits when the source has not been checked", () => {
    expect(toSourceHistoryView(SOURCE, []).checks).toEqual([]);
  });

  it("throws when a suspect visit was stored without a note", () => {
    expect(() =>
      toSourceHistoryView(SOURCE, [
        check({ outcome: "parser_suspect", note: "   " }),
      ]),
    ).toThrow(/note/);
  });

  it("throws when a changed visit has no snapshot", () => {
    expect(() =>
      toSourceHistoryView(SOURCE, [
        check({ outcome: "changed", observationId: null, archiveStatus: null }),
      ]),
    ).toThrow(/snapshot/);
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
