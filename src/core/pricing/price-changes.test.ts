import { describe, expect, it } from "vitest";
import { toPriceChanges, type PriceHistoryPeriod } from "./price-changes";

/**
 * Same January / May / June story as the chart tests.
 * The first period is the price we already had. Later periods are changes.
 * A first period is not itself a change.
 */

const FIRST_SEEN = new Date("2026-01-15T16:00:00.000Z");
const LAST_SEEN = new Date("2026-05-20T16:00:00.000Z");
const NEXT_SEEN = new Date("2026-06-02T16:00:00.000Z");
const LATER_SEEN = new Date("2026-07-01T16:00:00.000Z");

function row(dimension: string, amount: string, condition: unknown = {}) {
  return {
    dimension,
    unit: "usd_per_1m_tokens",
    amount,
    condition,
  };
}

function period(overrides: Partial<PriceHistoryPeriod> = {}): PriceHistoryPeriod {
  return {
    firstSeenAt: FIRST_SEEN,
    announcedOn: null,
    lastSeenAt: LAST_SEEN,
    components: [row("input", "1.25"), row("output", "5")],
    ...overrides,
  };
}

describe("toPriceChanges", () => {
  it("does not treat the first version as a change", () => {
    expect(toPriceChanges([period({ lastSeenAt: null })])).toEqual({
      versionCount: 1,
      sinceDay: "2026-01-15",
      events: [],
      latest: null,
      lastChanges: [],
    });
  });

  it("returns an empty log when there is no version", () => {
    expect(toPriceChanges([])).toEqual({
      versionCount: 0,
      sinceDay: null,
      events: [],
      latest: null,
      lastChanges: [],
    });
  });

  it("puts one changed component in one event", () => {
    const changes = toPriceChanges([
      period(),
      period({
        firstSeenAt: NEXT_SEEN,
        lastSeenAt: null,
        components: [row("input", "1"), row("output", "5")],
      }),
    ]);

    expect(changes.versionCount).toBe(2);
    expect(changes.sinceDay).toBe("2026-01-15");
    expect(changes.events).toEqual([
      {
        dateLine: "Changed on or before 2026-06-02.",
        previousDateLine: "Changed on or before 2026-01-15.",
        changes: [
          {
            dimension: "input",
            condition: {},
            fromAmount: "1.25",
            toAmount: "1",
            direction: "down",
            pctText: "20",
          },
        ],
      },
    ]);
    expect(changes.latest).toEqual(changes.events[0]);
    expect(changes.lastChanges).toEqual([
      {
        dimension: "input",
        condition: {},
        fromAmount: "1.25",
        toAmount: "1",
        direction: "down",
        pctText: "20",
        dateLine: "Changed on or before 2026-06-02.",
      },
    ]);
  });

  it("keeps several component changes inside the same event", () => {
    const changes = toPriceChanges([
      period(),
      period({
        firstSeenAt: NEXT_SEEN,
        lastSeenAt: null,
        components: [row("output", "10"), row("input", "2")],
      }),
    ]);

    expect(changes.events).toHaveLength(1);
    expect(changes.events[0]?.changes).toEqual([
      {
        dimension: "input",
        condition: {},
        fromAmount: "1.25",
        toAmount: "2",
        direction: "up",
        pctText: "60",
      },
      {
        dimension: "output",
        condition: {},
        fromAmount: "5",
        toAmount: "10",
        direction: "up",
        pctText: "100",
      },
    ]);
  });

  it("names an announced day and an observed day with the existing sentences", () => {
    const changes = toPriceChanges([
      period(),
      period({
        firstSeenAt: NEXT_SEEN,
        announcedOn: "2026-06-01",
        lastSeenAt: null,
        components: [row("input", "1"), row("output", "5")],
      }),
    ]);

    expect(changes.events[0]?.dateLine).toBe("Announced for 2026-06-01.");
    expect(changes.events[0]?.previousDateLine).toBe("Changed on or before 2026-01-15.");
  });

  it("lists a later change before an earlier one", () => {
    const changes = toPriceChanges([
      period({
        firstSeenAt: LATER_SEEN,
        lastSeenAt: null,
        components: [row("input", "0.80"), row("output", "5")],
      }),
      period(),
      period({
        firstSeenAt: NEXT_SEEN,
        lastSeenAt: new Date("2026-06-20T16:00:00.000Z"),
        components: [row("input", "1"), row("output", "5")],
      }),
    ]);

    expect(changes.events.map((event) => event.dateLine)).toEqual([
      "Changed on or before 2026-07-01.",
      "Changed on or before 2026-06-02.",
    ]);
    expect(changes.latest?.changes[0]).toMatchObject({
      dimension: "input",
      fromAmount: "1",
      toAmount: "0.80",
      direction: "down",
    });
    expect(changes.lastChanges).toEqual([
      {
        dimension: "input",
        condition: {},
        fromAmount: "1",
        toAmount: "0.80",
        direction: "down",
        pctText: "20",
        dateLine: "Changed on or before 2026-07-01.",
      },
    ]);
  });

  it("does not call equal decimals a change", () => {
    const changes = toPriceChanges([
      period({ components: [row("input", "1.0"), row("output", "0.10")] }),
      period({
        firstSeenAt: NEXT_SEEN,
        lastSeenAt: null,
        components: [row("input", "1"), row("output", "0.1")],
      }),
    ]);

    expect(changes.events).toEqual([]);
    expect(changes.latest).toBeNull();
    expect(changes.lastChanges).toEqual([]);
  });

  it("records a rise and a drop with the signed direction", () => {
    const changes = toPriceChanges([
      period({ components: [row("input", "10"), row("output", "4")] }),
      period({
        firstSeenAt: NEXT_SEEN,
        lastSeenAt: null,
        components: [row("input", "15"), row("output", "2")],
      }),
    ]);

    expect(changes.events[0]?.changes).toEqual([
      {
        dimension: "input",
        condition: {},
        fromAmount: "10",
        toAmount: "15",
        direction: "up",
        pctText: "50",
      },
      {
        dimension: "output",
        condition: {},
        fromAmount: "4",
        toAmount: "2",
        direction: "down",
        pctText: "50",
      },
    ]);
  });

  it("leaves the percent blank when the old amount is zero", () => {
    const changes = toPriceChanges([
      period({ components: [row("input", "0")] }),
      period({
        firstSeenAt: NEXT_SEEN,
        lastSeenAt: null,
        components: [row("input", "1")],
      }),
    ]);

    expect(changes.events[0]?.changes).toEqual([
      {
        dimension: "input",
        condition: {},
        fromAmount: "0",
        toAmount: "1",
        direction: "up",
        pctText: null,
      },
    ]);
  });

  it("treats a new component as a change with no old amount", () => {
    const changes = toPriceChanges([
      period({ components: [row("input", "10")] }),
      period({
        firstSeenAt: NEXT_SEEN,
        lastSeenAt: null,
        components: [row("input", "10"), row("cache_read", "0.25")],
      }),
    ]);

    expect(changes.events[0]?.changes).toEqual([
      {
        dimension: "cache_read",
        condition: {},
        fromAmount: null,
        toAmount: "0.25",
        direction: null,
        pctText: null,
      },
    ]);
  });

  it("keeps a tier change off the untiered row", () => {
    const tier = { promptTokensOver: 200000 };
    const changes = toPriceChanges([
      period({
        components: [row("input", "10"), row("input", "20", tier)],
      }),
      period({
        firstSeenAt: NEXT_SEEN,
        lastSeenAt: null,
        components: [row("input", "10"), row("input", "15", tier)],
      }),
    ]);

    expect(changes.events[0]?.changes).toEqual([
      {
        dimension: "input",
        condition: tier,
        fromAmount: "20",
        toAmount: "15",
        direction: "down",
        pctText: "25",
      },
    ]);
    expect(changes.lastChanges.map((change) => change.condition)).toEqual([tier]);
  });

  it("does not use an older change as the latest step when the open price is unchanged", () => {
    const changes = toPriceChanges([
      period({ components: [row("input", "15"), row("output", "5")] }),
      period({
        firstSeenAt: NEXT_SEEN,
        lastSeenAt: new Date("2026-06-20T16:00:00.000Z"),
        components: [row("input", "10"), row("output", "5")],
      }),
      period({
        firstSeenAt: LATER_SEEN,
        lastSeenAt: null,
        components: [row("input", "10"), row("output", "8")],
      }),
    ]);

    expect(changes.latest?.changes).toEqual([
      {
        dimension: "output",
        condition: {},
        fromAmount: "5",
        toAmount: "8",
        direction: "up",
        pctText: "60",
      },
    ]);
    expect(changes.lastChanges).toEqual([
      {
        dimension: "input",
        condition: {},
        fromAmount: "15",
        toAmount: "10",
        direction: "down",
        pctText: "33.33",
        dateLine: "Changed on or before 2026-06-02.",
      },
      {
        dimension: "output",
        condition: {},
        fromAmount: "5",
        toAmount: "8",
        direction: "up",
        pctText: "60",
        dateLine: "Changed on or before 2026-07-01.",
      },
    ]);
  });

  it("compares a backdated announcement after the version published first", () => {
    const changes = toPriceChanges([
      period({
        firstSeenAt: NEXT_SEEN,
        announcedOn: "2025-11-01",
        lastSeenAt: null,
        components: [row("input", "1"), row("output", "5")],
      }),
      period(),
    ]);

    expect(changes.sinceDay).toBe("2026-01-15");
    expect(changes.events).toEqual([
      {
        dateLine: "Announced for 2025-11-01.",
        previousDateLine: "Changed on or before 2026-01-15.",
        changes: [
          {
            dimension: "input",
            condition: {},
            fromAmount: "1.25",
            toAmount: "1",
            direction: "down",
            pctText: "20",
          },
        ],
      },
    ]);
    expect(changes.latest).toEqual(changes.events[0]);
  });

  it("throws when two fetches share one chart day", () => {
    expect(() =>
      toPriceChanges([
        period({ lastSeenAt: LAST_SEEN }),
        period({
          firstSeenAt: NEXT_SEEN,
          announcedOn: "2026-01-15",
          lastSeenAt: null,
          components: [row("input", "1")],
        }),
      ]),
    ).toThrow(/same day/);
  });

  it("rounds a repeating percent to two decimal places", () => {
    const changes = toPriceChanges([
      period({ components: [row("input", "3")] }),
      period({
        firstSeenAt: NEXT_SEEN,
        lastSeenAt: null,
        components: [row("input", "2")],
      }),
    ]);

    expect(changes.events[0]?.changes[0]?.pctText).toBe("33.33");
  });

  it("throws when an amount is not a decimal string", () => {
    expect(() =>
      toPriceChanges([
        period({ components: [row("input", "nope")] }),
        period({
          firstSeenAt: NEXT_SEEN,
          lastSeenAt: null,
          components: [row("input", "1")],
        }),
      ]),
    ).toThrow(/decimal string/);
  });
});
