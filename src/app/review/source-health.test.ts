import { describe, expect, it } from "vitest";
import { toSourceHealthView, type SourceHealthRow } from "./source-health";

const ANTHROPIC = "https://platform.claude.com/docs/en/about-claude/pricing.md";
const OPENAI = "https://developers.openai.com/api/docs/pricing.md";
const CHECKED = new Date("2026-11-07T12:00:00.000Z");

function row(overrides: Partial<SourceHealthRow> = {}): SourceHealthRow {
  return {
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
          url: ANTHROPIC,
          typeText: "official",
          activeText: "Active",
          lastCheckedText: "2026-11-07 12:00:00 UTC",
          outcomeText: "Prices unchanged",
          checkedAtText: "2026-11-07 12:00:00 UTC",
          httpStatusText: "200",
          note: null,
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
      outcomeText: null,
      checkedAtText: null,
      httpStatusText: null,
      note: null,
      archiveText: "No snapshot yet.",
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
