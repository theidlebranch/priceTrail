import { describe, expect, it } from "vitest";
import {
  assessSourceHealth,
  findArchiveAnomalies,
  formatUtcCompact,
  groupChecks,
  relativeTime,
  type HealthCheck,
  type HealthSnapshot,
} from "./source-health";

const NOW = new Date("2026-11-07T12:00:00.000Z");
const HOUR = 3_600_000;

function check(overrides: Partial<HealthCheck> = {}): HealthCheck {
  return {
    id: 10,
    fetchedAt: new Date(NOW.getTime() - HOUR),
    httpStatus: 200,
    outcome: "unchanged",
    note: null,
    observationId: null,
    archiveStatus: null,
    archiveUrl: null,
    ...overrides,
  };
}

function snapshot(overrides: Partial<HealthSnapshot> = {}): HealthSnapshot {
  return {
    id: 40,
    archiveStatus: "archived",
    archiveUrl: "https://web.archive.org/web/20261107110000/https://example.test/prices",
    fetchedAt: new Date(NOW.getTime() - HOUR),
    ...overrides,
  };
}

function hoursAgo(hours: number): Date {
  return new Date(NOW.getTime() - hours * HOUR);
}

describe("assessSourceHealth", () => {
  it("treats a new source with no checks as unchecked", () => {
    const health = assessSourceHealth({
      active: true,
      checks: [],
      now: NOW,
      latestChangeAt: null,
      latestSnapshot: null,
    });

    expect(health.status).toBe("unchecked");
    expect(health.reason).toBe("Not checked yet");
    expect(health.attention).toBeNull();
    expect(health.successRate).toEqual({ ok: 0, total: 0 });
    expect(health.strip).toHaveLength(24);
    expect(health.strip.every((slot) => slot.outcome === null)).toBe(true);
    expect(health.stripLabel).toBe(
      "0 unchanged, 0 changed, 0 parser failed, 0 download failed, 24 empty",
    );
  });

  it("pauses an inactive source even when the latest download failed", () => {
    const health = assessSourceHealth({
      active: false,
      checks: [check({ outcome: "fetch_error", httpStatus: null, note: "network down" })],
      now: NOW,
      latestChangeAt: null,
      latestSnapshot: null,
    });

    expect(health.status).toBe("paused");
    expect(health.reason).toBe("Paused");
    expect(health.attention).toBeNull();
    expect(health.successRate).toEqual({ ok: 0, total: 1 });
  });

  it("says download failed once, after unchanged checks, and names the last good read", () => {
    const failedAt = hoursAgo(1);
    const goodAt = hoursAgo(7);
    const health = assessSourceHealth({
      active: true,
      checks: [
        check({ id: 3, outcome: "fetch_error", httpStatus: null, note: "network down", fetchedAt: failedAt }),
        check({ id: 2, outcome: "unchanged", fetchedAt: goodAt }),
        check({ id: 1, outcome: "unchanged", fetchedAt: hoursAgo(13) }),
      ],
      now: NOW,
      latestChangeAt: null,
      latestSnapshot: null,
    });

    expect(health.status).toBe("attention");
    expect(health.reason).toBe("Download failed");
    expect(health.streak).toBe(1);
    expect(health.since).toEqual(failedAt);
    expect(health.attention).toEqual({
      title: "Download failed",
      body: "The site did not return a page, so nothing was stored or published. The last good read was 7h ago.",
      note: "network down",
    });
  });

  it("resets a failure streak when a good check, or a different note, sits in between", () => {
    const newest = hoursAgo(1);
    const second = hoursAgo(7);
    const health = assessSourceHealth({
      active: true,
      checks: [
        check({ id: 8, outcome: "fetch_error", httpStatus: null, note: "timeout", fetchedAt: newest }),
        check({ id: 7, outcome: "fetch_error", httpStatus: null, note: "timeout", fetchedAt: second }),
        check({ id: 6, outcome: "unchanged", fetchedAt: hoursAgo(13) }),
        check({ id: 5, outcome: "fetch_error", httpStatus: null, note: "timeout", fetchedAt: hoursAgo(19) }),
        check({ id: 4, outcome: "fetch_error", httpStatus: null, note: "other", fetchedAt: hoursAgo(25) }),
      ],
      now: NOW,
      latestChangeAt: null,
      latestSnapshot: null,
    });

    expect(health.reason).toBe("Download failing · 2 checks in a row");
    expect(health.streak).toBe(2);
    expect(health.since).toEqual(second);
    expect(health.attention?.body).toContain("The last good read was 13h ago.");
  });

  it("says 24+ when every loaded check is the same download failure", () => {
    const checks = Array.from({ length: 24 }, (_, index) =>
      check({
        id: 24 - index,
        outcome: "fetch_error",
        httpStatus: null,
        note: "network down",
        fetchedAt: hoursAgo(index + 1),
      }),
    );

    const health = assessSourceHealth({
      active: true,
      checks,
      now: NOW,
      latestChangeAt: null,
      latestSnapshot: null,
    });

    expect(health.reason).toBe("Download failing · 24+ checks in a row");
    expect(health.streak).toBe(24);
    expect(health.attention?.body).toContain("There is no good read in the last 24 checks.");
    expect(health.successRate).toEqual({ ok: 0, total: 24 });
  });

  it("treats one parser failure as attention, and does not invent an HTTP code", () => {
    const withStatus = assessSourceHealth({
      active: true,
      checks: [check({ outcome: "parser_suspect", httpStatus: 200, note: "0 matching tables" })],
      now: NOW,
      latestChangeAt: null,
      latestSnapshot: null,
    });
    const withoutStatus = assessSourceHealth({
      active: true,
      checks: [check({ outcome: "parser_suspect", httpStatus: null, note: "0 matching tables" })],
      now: NOW,
      latestChangeAt: null,
      latestSnapshot: null,
    });

    expect(withStatus.reason).toBe("Parser failed");
    expect(withStatus.tone).toBe("warn");
    expect(withStatus.attention?.body).toBe(
      "The site answered with HTTP 200 but the page could not be read, so nothing was stored or published. There is no good read in the last 24 checks.",
    );
    expect(withoutStatus.attention?.body.startsWith("The site answered, but the page could not be read")).toBe(
      true,
    );
    expect(withoutStatus.attention?.body).not.toContain("HTTP");
  });

  it("counts a parser streak the same way as a download streak", () => {
    const health = assessSourceHealth({
      active: true,
      checks: [
        check({ id: 3, outcome: "parser_suspect", note: "0 matching tables", fetchedAt: hoursAgo(1) }),
        check({ id: 2, outcome: "parser_suspect", note: "0 matching tables", fetchedAt: hoursAgo(7) }),
        check({ id: 1, outcome: "parser_suspect", note: "0 matching tables", fetchedAt: hoursAgo(13) }),
      ],
      now: NOW,
      latestChangeAt: null,
      latestSnapshot: null,
    });

    expect(health.reason).toBe("Parser failing · 3 checks in a row");
    expect(health.since).toEqual(hoursAgo(13));
  });

  it("is stale only when the newest check is older than 13 hours", () => {
    const fresh = assessSourceHealth({
      active: true,
      checks: [check({ fetchedAt: new Date(NOW.getTime() - 13 * HOUR) })],
      now: NOW,
      latestChangeAt: null,
      latestSnapshot: snapshot(),
    });
    const stale = assessSourceHealth({
      active: true,
      checks: [check({ fetchedAt: new Date(NOW.getTime() - 13 * HOUR - 1) })],
      now: NOW,
      latestChangeAt: null,
      latestSnapshot: snapshot({ archiveStatus: "failed" }),
    });

    expect(fresh.status).toBe("healthy");
    expect(stale.status).toBe("attention");
    expect(stale.reason).toBe("No check for 13h");
    expect(stale.attention?.body).toBe(
      "The last check was 13h ago. The schedule runs about every 6 hours.",
    );
  });

  it("warns when the latest snapshot failed and the check itself is fresh", () => {
    const health = assessSourceHealth({
      active: true,
      checks: [check()],
      now: NOW,
      latestChangeAt: hoursAgo(48),
      latestSnapshot: snapshot({ archiveStatus: "failed", archiveUrl: null }),
    });

    expect(health.status).toBe("attention");
    expect(health.reason).toBe("Wayback failed · stored copy kept");
    expect(health.attention?.body).toBe(
      "Wayback did not keep a copy. The stored page text is still the evidence. Nothing new was published from this warning.",
    );
  });

  it("warns when a pending snapshot is older than 24 hours, and not when it is exactly 24", () => {
    const pendingFor = (ageMs: number) =>
      assessSourceHealth({
        active: true,
        checks: [check()],
        now: NOW,
        latestChangeAt: null,
        latestSnapshot: snapshot({
          archiveStatus: "pending",
          archiveUrl: null,
          fetchedAt: new Date(NOW.getTime() - ageMs),
        }),
      });

    expect(pendingFor(24 * HOUR).status).toBe("healthy");
    const late = pendingFor(24 * HOUR + 1);
    expect(late.reason).toBe("Archive pending for 24h");
    expect(late.attention?.body).toBe(
      "The snapshot is stored here, and the Internet Archive has not returned a permalink for 24 hours.",
    );
    expect(pendingFor(25 * HOUR).reason).toBe("Archive pending for 25h");
  });

  it("says prices changed, or unchanged, when nothing else needs attention", () => {
    const changed = assessSourceHealth({
      active: true,
      checks: [check({ outcome: "changed", observationId: 9, archiveStatus: "archived" })],
      now: NOW,
      latestChangeAt: hoursAgo(48),
      latestSnapshot: snapshot(),
    });
    const quiet = assessSourceHealth({
      active: true,
      checks: [check(), check({ id: 9, outcome: "changed", observationId: 8, archiveStatus: "archived" })],
      now: NOW,
      latestChangeAt: null,
      latestSnapshot: snapshot({ archiveStatus: "pending", fetchedAt: hoursAgo(2) }),
    });

    expect(changed.status).toBe("healthy");
    expect(changed.reason).toBe("Prices changed 2d ago");
    expect(changed.tone).toBe("changed");
    expect(changed.successRate).toEqual({ ok: 1, total: 1 });
    expect(quiet.reason).toBe("Prices unchanged");
    expect(quiet.tone).toBe("unchanged");
    expect(quiet.successRate).toEqual({ ok: 2, total: 2 });
  });

  it("pads the strip to exactly 24, with the newest check on the right", () => {
    const health = assessSourceHealth({
      active: true,
      checks: [
        check({ id: 2, outcome: "changed", fetchedAt: hoursAgo(1), observationId: 4, archiveStatus: "archived" }),
        check({ id: 1, outcome: "fetch_error", httpStatus: null, note: "down", fetchedAt: hoursAgo(7) }),
      ],
      now: NOW,
      latestChangeAt: hoursAgo(1),
      latestSnapshot: snapshot(),
    });

    expect(health.strip).toHaveLength(24);
    expect(health.strip[0]).toEqual({ outcome: null, title: "No check" });
    expect(health.strip[22]).toEqual({
      outcome: "fetch_error",
      title: "2026-11-07 05:00:00 UTC · fetch_error · —",
    });
    expect(health.strip[23]?.outcome).toBe("changed");
    expect(health.strip[23]?.title).toContain("HTTP 200");
    expect(health.stripLabel).toBe(
      "0 unchanged, 1 changed, 0 parser failed, 1 download failed, 22 empty",
    );
  });

  it("refuses more than 24 checks instead of guessing which ones to drop", () => {
    expect(() =>
      assessSourceHealth({
        active: true,
        checks: Array.from({ length: 25 }, (_, index) => check({ id: index + 1 })),
        now: NOW,
        latestChangeAt: null,
        latestSnapshot: null,
      }),
    ).toThrow(/24/);
  });
});

describe("formatUtcCompact", () => {
  it("prints a short UTC stamp, a clock, and a date", () => {
    expect(formatUtcCompact(new Date("2026-11-07T12:05:00.000Z"))).toEqual({
      short: "Nov 7 · 12:05",
      clock: "12:05",
      date: "Nov 7",
    });
  });

  it("refuses a value that is not a real date", () => {
    expect(() => formatUtcCompact(new Date("not a date"))).toThrow(/real date/);
  });
});

describe("relativeTime", () => {
  it("rounds down to just now, minutes, hours, and days", () => {
    expect(relativeTime(new Date(NOW.getTime() - 30_000), NOW)).toBe("just now");
    expect(relativeTime(new Date(NOW.getTime() - 5 * 60_000), NOW)).toBe("5m ago");
    expect(relativeTime(new Date(NOW.getTime() - 5 * HOUR), NOW)).toBe("5h ago");
    expect(relativeTime(new Date(NOW.getTime() - 2 * 24 * HOUR), NOW)).toBe("2d ago");
  });
});

describe("groupChecks", () => {
  it("keeps every price change alone and merges the other matching runs", () => {
    const changedA = check({
      id: 9,
      outcome: "changed",
      note: "new",
      observationId: 90,
      archiveStatus: "archived",
    });
    const changedB = check({
      id: 8,
      outcome: "changed",
      note: "new",
      observationId: 80,
      archiveStatus: "archived",
    });
    const quietA = check({ id: 7, outcome: "unchanged" });
    const quietB = check({ id: 6, outcome: "unchanged" });
    const errorA = check({ id: 5, outcome: "fetch_error", httpStatus: null, note: "down" });
    const errorB = check({ id: 4, outcome: "fetch_error", httpStatus: null, note: "down" });
    const errorC = check({ id: 3, outcome: "fetch_error", httpStatus: null, note: "other" });
    const parser = check({ id: 2, outcome: "parser_suspect", note: "0 tables" });
    const first = check({ id: 1, outcome: "unchanged" });

    const rows = groupChecks(
      [changedA, changedB, quietA, quietB, errorA, errorB, errorC, parser, first],
      1,
    );

    expect(rows.map((row) => row.kind)).toEqual([
      "single",
      "single",
      "group",
      "group",
      "single",
      "single",
      "single",
    ]);
    expect(rows[0]).toMatchObject({ check: { id: 9 }, isFirstCheck: false });
    expect(rows[1]).toMatchObject({ check: { id: 8 } });
    expect(rows[2]).toMatchObject({ kind: "group", isFirstCheck: false });
    if (rows[2]?.kind === "group") {
      expect(rows[2].checks.map((item) => item.id)).toEqual([7, 6]);
    }
    if (rows[3]?.kind === "group") {
      expect(rows[3].checks.map((item) => item.id)).toEqual([5, 4]);
    }
    expect(rows[4]).toMatchObject({ kind: "single", check: { id: 3 } });
    expect(rows[6]).toMatchObject({ kind: "single", check: { id: 1 }, isFirstCheck: true });
  });

  it("leaves a single matching check as one row", () => {
    expect(groupChecks([check({ id: 4 })], 4)).toEqual([
      { kind: "single", check: check({ id: 4 }), isFirstCheck: true },
    ]);
  });
});

describe("findArchiveAnomalies", () => {
  it("points later copies at the earliest observation, and ignores a missing url", () => {
    const shared = "https://web.archive.org/save/https://example.test/prices";
    const chips = findArchiveAnomalies([
      { observationId: 30, archiveUrl: shared, fetchedAt: hoursAgo(1) },
      { observationId: 20, archiveUrl: shared, fetchedAt: hoursAgo(2) },
      { observationId: 10, archiveUrl: shared, fetchedAt: hoursAgo(3) },
      { observationId: 40, archiveUrl: null, fetchedAt: hoursAgo(1) },
      { observationId: 41, archiveUrl: null, fetchedAt: hoursAgo(2) },
    ]);

    expect(chips.get(30)).toEqual(["same capture as #10"]);
    expect(chips.get(20)).toEqual(["same capture as #10"]);
    expect(chips.has(10)).toBe(false);
    expect(chips.has(40)).toBe(false);
    expect(chips.has(41)).toBe(false);
  });

  it("warns when the capture timestamp is more than one hour older than the check", () => {
    const url = "https://web.archive.org/web/20261107100000/https://example.test/prices";
    const captured = new Date("2026-11-07T10:00:00.000Z");
    const exact = findArchiveAnomalies([
      { observationId: 1, archiveUrl: url, fetchedAt: new Date(captured.getTime() + HOUR) },
    ]);
    const justOver = findArchiveAnomalies([
      { observationId: 2, archiveUrl: url, fetchedAt: new Date(captured.getTime() + HOUR + 1) },
    ]);
    const threeHours = findArchiveAnomalies([
      { observationId: 3, archiveUrl: url, fetchedAt: new Date(captured.getTime() + 3 * HOUR) },
    ]);
    const noStamp = findArchiveAnomalies([
      {
        observationId: 4,
        archiveUrl: "https://web.archive.org/web/example",
        fetchedAt: new Date(captured.getTime() + 3 * HOUR),
      },
    ]);

    expect(exact.has(1)).toBe(false);
    expect(justOver.get(2)).toEqual(["capture is 1h older than the check"]);
    expect(threeHours.get(3)).toEqual(["capture is 3h older than the check"]);
    expect(noStamp.has(4)).toBe(false);
  });
});
