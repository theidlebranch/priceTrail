import { describe, expect, it } from "vitest";
import {
  toPriceHistories,
  type PriceHistoryPeriod,
  type PriceHistorySegment,
  type PriceHistorySeries,
} from "./price-history";

/**
 * These dates and amounts are the worked examples in docs/price-tables.md.
 * Example 1: nobody named a day. The old input was 1.25 through 20 May.
 * The new input is 1, first fetched on 2 June.
 * Example 2: a source named 1 June, and we still first fetched the page on 2 June.
 */

const AS_OF = new Date("2026-06-10T16:00:00.000Z");
const FIRST_SEEN = new Date("2026-01-15T16:00:00.000Z");
const LAST_SEEN = new Date("2026-05-20T16:00:00.000Z");
const NEXT_SEEN = new Date("2026-06-02T16:00:00.000Z");

function input(amount: string, condition: unknown = {}) {
  return {
    dimension: "input",
    unit: "usd_per_1m_tokens",
    amount,
    condition,
  };
}

function output(amount: string) {
  return { ...input(amount), dimension: "output" };
}

function period(overrides: Partial<PriceHistoryPeriod> = {}): PriceHistoryPeriod {
  return {
    firstSeenAt: FIRST_SEEN,
    announcedOn: null,
    lastSeenAt: LAST_SEEN,
    components: [input("1.25"), output("5")],
    ...overrides,
  };
}

function series(
  dimension: PriceHistorySeries["dimension"],
  label: string,
  latestAmountText: string,
  segments: PriceHistorySegment[],
  changeCount = 0,
): PriceHistorySeries {
  return { dimension, label, latestAmountText, changeCount, segments };
}

const OLD_OUTPUT: PriceHistorySeries = series("output", "Output", "5", [
  {
    kind: "known",
    from: "2026-01-15",
    to: "2026-05-20",
    amountText: "5",
    amount: 5,
    label: "Changed on or before 2026-01-15.",
  },
]);

describe("toPriceHistories", () => {
  it("draws the old input until it was last seen, then a gap until the next fetch", () => {
    expect(
      toPriceHistories(
        [
          period({
            firstSeenAt: NEXT_SEEN,
            lastSeenAt: null,
            components: [input("1")],
          }),
          period(),
        ],
        AS_OF,
      ),
    ).toEqual({
      series: [
        series(
          "input",
          "Input",
          "1",
          [
            {
              kind: "known",
              from: "2026-01-15",
              to: "2026-05-20",
              amountText: "1.25",
              amount: 1.25,
              label: "Changed on or before 2026-01-15.",
            },
            {
              kind: "gap",
              from: "2026-05-20",
              to: "2026-06-02",
              fromAmountText: "1.25",
              toAmountText: "1",
              fromAmount: 1.25,
              toAmount: 1,
            },
            {
              kind: "known",
              from: "2026-06-02",
              to: "2026-06-10",
              amountText: "1",
              amount: 1,
              label: "Changed on or before 2026-06-02.",
            },
          ],
          1,
        ),
        OLD_OUTPUT,
      ],
      skipped: [],
    });
  });

  it("starts the new solid line on the announced day and still ends the gap on the fetch", () => {
    expect(
      toPriceHistories(
        [
          period(),
          period({
            firstSeenAt: NEXT_SEEN,
            announcedOn: "2026-06-01",
            lastSeenAt: null,
            components: [input("1")],
          }),
        ],
        AS_OF,
      ),
    ).toEqual({
      series: [
        series(
          "input",
          "Input",
          "1",
          [
            {
              kind: "known",
              from: "2026-01-15",
              to: "2026-05-20",
              amountText: "1.25",
              amount: 1.25,
              label: "Changed on or before 2026-01-15.",
            },
            {
              kind: "gap",
              from: "2026-05-20",
              to: "2026-06-02",
              fromAmountText: "1.25",
              toAmountText: "1",
              fromAmount: 1.25,
              toAmount: 1,
            },
            {
              kind: "known",
              from: "2026-06-01",
              to: "2026-06-10",
              amountText: "1",
              amount: 1,
              label: "Announced for 2026-06-01.",
            },
          ],
          1,
        ),
        OLD_OUTPUT,
      ],
      skipped: [],
    });
  });

  it("extends one open period through asOf and does not call that end a price change", () => {
    expect(
      toPriceHistories(
        [
          period({
            firstSeenAt: new Date("2026-10-18T00:00:00.000Z"),
            lastSeenAt: null,
            components: [input("10"), output("50"), { ...input("0.25"), dimension: "cache_read" }],
          }),
        ],
        new Date("2026-11-05T12:00:00.000Z"),
      ),
    ).toEqual({
      series: [
        series("input", "Input", "10", [
          {
            kind: "known",
            from: "2026-10-18",
            to: "2026-11-05",
            amountText: "10",
            amount: 10,
            label: "Changed on or before 2026-10-18.",
          },
        ]),
        series("cache_read", "Cache read", "0.25", [
          {
            kind: "known",
            from: "2026-10-18",
            to: "2026-11-05",
            amountText: "0.25",
            amount: 0.25,
            label: "Changed on or before 2026-10-18.",
          },
        ]),
        series("output", "Output", "50", [
          {
            kind: "known",
            from: "2026-10-18",
            to: "2026-11-05",
            amountText: "50",
            amount: 50,
            label: "Changed on or before 2026-10-18.",
          },
        ]),
      ],
      skipped: [],
    });
  });

  it("uses the UTC day when the clock is 23:30Z", () => {
    const history = toPriceHistories(
      [
        period({
          firstSeenAt: new Date("2026-06-01T23:30:00.000Z"),
          lastSeenAt: null,
          components: [input("1")],
        }),
      ],
      new Date("2026-06-02T00:30:00.000Z"),
    );

    expect(history.series[0]).toMatchObject({
      dimension: "input",
      segments: [{ kind: "known", from: "2026-06-01", to: "2026-06-02" }],
    });
  });

  it("returns no series when there is no period", () => {
    expect(toPriceHistories([], AS_OF)).toEqual({ series: [], skipped: [] });
  });

  it("leaves out a dimension that no period publishes", () => {
    const history = toPriceHistories(
      [period({ lastSeenAt: null, components: [input("1"), output("5")] })],
      AS_OF,
    );

    expect(history.series.map((item) => item.dimension)).toEqual(["input", "output"]);
    expect(history.skipped).toEqual([]);
  });

  it("connects a gap across a period that omits the dimension", () => {
    const history = toPriceHistories(
      [
        period(),
        period({
          firstSeenAt: NEXT_SEEN,
          lastSeenAt: new Date("2026-06-15T16:00:00.000Z"),
          components: [input("1")],
        }),
        period({
          firstSeenAt: new Date("2026-07-01T16:00:00.000Z"),
          lastSeenAt: null,
          components: [input("0.80"), output("4")],
        }),
      ],
      new Date("2026-07-15T00:00:00.000Z"),
    );

    expect(history.series.find((item) => item.dimension === "output")).toEqual(
      series("output", "Output", "4", [
        {
          kind: "known",
          from: "2026-01-15",
          to: "2026-05-20",
          amountText: "5",
          amount: 5,
          label: "Changed on or before 2026-01-15.",
        },
        {
          kind: "gap",
          from: "2026-05-20",
          to: "2026-07-01",
          fromAmountText: "5",
          toAmountText: "4",
          fromAmount: 5,
          toAmount: 4,
        },
        {
          kind: "known",
          from: "2026-07-01",
          to: "2026-07-15",
          amountText: "4",
          amount: 4,
          label: "Changed on or before 2026-07-01.",
        },
      ], 1),
    );
  });

  it("counts a new amount once and treats 1.0 and 1 as the same price", () => {
    const history = toPriceHistories(
      [
        period({ components: [input("1.25"), output("5")] }),
        period({
          firstSeenAt: NEXT_SEEN,
          lastSeenAt: new Date("2026-06-20T16:00:00.000Z"),
          components: [input("1.0"), output("4")],
        }),
        period({
          firstSeenAt: new Date("2026-06-21T16:00:00.000Z"),
          lastSeenAt: new Date("2026-06-28T16:00:00.000Z"),
          components: [input("1"), output("4")],
        }),
        period({
          firstSeenAt: new Date("2026-07-01T16:00:00.000Z"),
          lastSeenAt: null,
          components: [input("0.5"), output("4")],
        }),
      ],
      new Date("2026-07-15T00:00:00.000Z"),
    );

    expect(history.series.find((item) => item.dimension === "input")?.changeCount).toBe(2);
    expect(history.series.find((item) => item.dimension === "output")?.changeCount).toBe(1);
  });

  it("skips a dimension with two rows and still charts the others", () => {
    expect(
      toPriceHistories(
        [
          period({
            lastSeenAt: null,
            components: [input("1"), input("0.50", { promptTokensAtMost: 100000 }), output("5")],
          }),
        ],
        AS_OF,
      ),
    ).toEqual({
      series: [
        series("output", "Output", "5", [
          {
            kind: "known",
            from: "2026-01-15",
            to: "2026-06-10",
            amountText: "5",
            amount: 5,
            label: "Changed on or before 2026-01-15.",
          },
        ]),
      ],
      skipped: [{ dimension: "input", label: "Input" }],
    });
  });

  it("throws when the input condition is not an object", () => {
    expect(() =>
      toPriceHistories([period({ lastSeenAt: null, components: [input("1", null)] })], AS_OF),
    ).toThrow(/condition/);
  });

  it("skips a dimension whose only row is a tier", () => {
    expect(
      toPriceHistories(
        [
          period({
            lastSeenAt: null,
            components: [input("0.50", { promptTokensAtMost: 100000 })],
          }),
        ],
        AS_OF,
      ),
    ).toEqual({
      series: [],
      skipped: [{ dimension: "input", label: "Input" }],
    });
  });

  it("charts output when a period has no input row", () => {
    expect(
      toPriceHistories(
        [period({ lastSeenAt: null, components: [output("5")] })],
        AS_OF,
      ),
    ).toEqual({
      series: [
        series("output", "Output", "5", [
          {
            kind: "known",
            from: "2026-01-15",
            to: "2026-06-10",
            amountText: "5",
            amount: 5,
            label: "Changed on or before 2026-01-15.",
          },
        ]),
      ],
      skipped: [],
    });
  });

  it("throws when the unit is not USD per 1M tokens", () => {
    expect(() =>
      toPriceHistories(
        [
          period({
            lastSeenAt: null,
            components: [{ ...input("1"), unit: "usd_per_call" }],
          }),
        ],
        AS_OF,
      ),
    ).toThrow(/usd_per_1m_tokens/);
  });

  it("throws when the amount is blank", () => {
    expect(() =>
      toPriceHistories([period({ lastSeenAt: null, components: [input("")] })], AS_OF),
    ).toThrow(/decimal string/);
  });

  it("throws when the amount is not a decimal", () => {
    expect(() =>
      toPriceHistories([period({ lastSeenAt: null, components: [input("nope")] })], AS_OF),
    ).toThrow(/decimal string/);
  });

  it("throws when the amount is negative", () => {
    expect(() =>
      toPriceHistories([period({ lastSeenAt: null, components: [input("-1")] })], AS_OF),
    ).toThrow(/decimal string/);
  });

  it("throws when a dimension is not a known price", () => {
    expect(() =>
      toPriceHistories(
        [
          period({
            lastSeenAt: null,
            components: [{ ...input("1"), dimension: "audio" }],
          }),
        ],
        AS_OF,
      ),
    ).toThrow(/dimension audio/);
  });

  it("throws when announcedOn is not a real calendar day", () => {
    expect(() =>
      toPriceHistories([period({ lastSeenAt: null, announcedOn: "2026-02-31" })], AS_OF),
    ).toThrow(/YYYY-MM-DD/);
  });

  it("throws when lastSeenAt is not a real time", () => {
    expect(() =>
      toPriceHistories([period({ lastSeenAt: new Date("not-a-date") })], AS_OF),
    ).toThrow(/lastSeenAt/);
  });

  it("throws when firstSeenAt is not a real time", () => {
    expect(() =>
      toPriceHistories(
        [period({ firstSeenAt: new Date("not-a-date"), lastSeenAt: null })],
        AS_OF,
      ),
    ).toThrow(/firstSeenAt/);
  });

  it("throws when an earlier period is still open", () => {
    expect(() =>
      toPriceHistories(
        [
          period({ lastSeenAt: null }),
          period({
            firstSeenAt: NEXT_SEEN,
            lastSeenAt: null,
            components: [input("1")],
          }),
        ],
        AS_OF,
      ),
    ).toThrow(/still open/);
  });

  it("throws when two periods start on the same day", () => {
    expect(() =>
      toPriceHistories(
        [
          period({ lastSeenAt: LAST_SEEN }),
          period({
            firstSeenAt: FIRST_SEEN,
            lastSeenAt: null,
            components: [input("1")],
          }),
        ],
        AS_OF,
      ),
    ).toThrow(/same day/);
  });

  it("throws when asOf is before a chart start", () => {
    expect(() =>
      toPriceHistories([period({ lastSeenAt: null })], new Date("2026-01-01T00:00:00.000Z")),
    ).toThrow(/asOf is before the chart start/);
  });

  it("throws when last seen is before the chart start", () => {
    expect(() =>
      toPriceHistories(
        [
          period({
            firstSeenAt: NEXT_SEEN,
            lastSeenAt: LAST_SEEN,
          }),
        ],
        AS_OF,
      ),
    ).toThrow(/last seen is before the chart start/);
  });

  it("throws when the next fetch is before the previous last seen", () => {
    expect(() =>
      toPriceHistories(
        [
          period({
            lastSeenAt: new Date("2026-06-10T16:00:00.000Z"),
          }),
          period({
            firstSeenAt: NEXT_SEEN,
            announcedOn: "2026-07-01",
            lastSeenAt: null,
            components: [input("1")],
          }),
        ],
        new Date("2026-07-15T00:00:00.000Z"),
      ),
    ).toThrow(/before the previous last seen/);
  });

  it("throws when asOf is not a real time", () => {
    expect(() => toPriceHistories([], new Date("not-a-date"))).toThrow(/asOf/);
  });
});
