import { describe, expect, it } from "vitest";
import {
  toModelDetailView,
  type ModelDetailPriceRow,
  type ModelDetailRead,
} from "./model-detail-view";

const SOURCE = "https://platform.claude.com/docs/en/about-claude/pricing.md";
const AS_OF = new Date("2026-11-05T12:00:00.000Z");

function read(overrides: Partial<ModelDetailRead> = {}): ModelDetailRead {
  return {
    labName: "Anthropic",
    modelName: "Claude Fable 5.1",
    deprecatedAt: null,
    offerings: [offering()],
    ...overrides,
  };
}

function offering(
  overrides: Partial<ModelDetailRead["offerings"][number]> = {},
): ModelDetailRead["offerings"][number] {
  const open = version();
  return {
    openVersions: [open],
    historyVersions: [{ ...open, lastSeenAt: null }],
    officialSourceUrls: [SOURCE],
    reviewStatuses: ["confirmed"],
    ...overrides,
  };
}

function version(
  overrides: Partial<ModelDetailRead["offerings"][number]["openVersions"][number]> = {},
): ModelDetailRead["offerings"][number]["openVersions"][number] {
  return {
    firstSeenAt: new Date("2026-10-18T23:30:00.000Z"),
    announcedOn: null,
    components: [
      component({ dimension: "output", amount: "50" }),
      component({ dimension: "cache_write_1h", amount: "20" }),
      component({ dimension: "input", amount: "10" }),
      component({ dimension: "cache_write_5m", amount: "12.5" }),
      component({ dimension: "cache_read", amount: "0.25" }),
    ],
    ...overrides,
  };
}

function openSeries(
  dimension: "input" | "cache_read" | "output" | "cache_write" | "cache_write_5m" | "cache_write_1h",
  label: string,
  amountText: string,
  amount: number,
) {
    return {
    dimension,
    label,
    latestAmountText: amountText,
    changeCount: 0,
    segments: [
      {
        kind: "known" as const,
        from: "2026-10-18",
        to: "2026-11-05",
        amountText,
        amount,
        label: "Changed on or before 2026-10-18.",
      },
    ],
  };
}

function priceRow(
  dimensionLabel: string,
  amountText: string,
  conditionLabel = "",
  multiplierText: string | null = null,
): ModelDetailPriceRow {
  return {
    dimensionLabel,
    amountText,
    conditionLabel,
    multiplierText,
    lastChange: null,
  };
}

function component(
  overrides: Partial<ModelDetailRead["offerings"][number]["openVersions"][number]["components"][number]> = {},
): ModelDetailRead["offerings"][number]["openVersions"][number]["components"][number] {
  return {
    dimension: "input",
    unit: "usd_per_1m_tokens",
    amount: "10",
    condition: {},
    ...overrides,
  };
}

describe("toModelDetailView", () => {
  it("shows the open price as stored decimals, in a fixed dimension order", () => {
    expect(toModelDetailView(read(), AS_OF)).toEqual({
      labName: "Anthropic",
      modelName: "Claude Fable 5.1",
      retired: false,
      versionCount: 1,
      sinceDay: "2026-10-18",
      headlines: [
        { label: "Input", amountText: "$10", change: null },
        { label: "Output", amountText: "$50", change: null },
      ],
      events: [],
      price: {
        dateLine: "Changed on or before 2026-10-18.",
        sourceUrl: SOURCE,
        sourceLabel: "Official pricing page",
        components: [
          priceRow("Input", "$10"),
          priceRow("Cache read", "$0.25", "", "0.025×"),
          priceRow("Output", "$50", "", "5×"),
          priceRow("Cache write (5 minutes)", "$12.5", "", "1.25×"),
          priceRow("Cache write (1 hour)", "$20", "", "2×"),
        ],
      },
      history: {
        series: [
          openSeries("input", "Input", "10", 10),
          openSeries("cache_read", "Cache read", "0.25", 0.25),
          openSeries("output", "Output", "50", 50),
          openSeries("cache_write_5m", "Cache write (5 minutes)", "12.5", 12.5),
          openSeries("cache_write_1h", "Cache write (1 hour)", "20", 20),
        ],
        skipped: [],
      },
      changeUnderReview: false,
    });
  });

  it("keeps cache-write tiers grouped when a condition label would sort between them", () => {
    const view = toModelDetailView(
      read({
        offerings: [
          offering({
            openVersions: [
              version({
                components: [
                  component({
                    dimension: "cache_write_1h",
                    amount: "2",
                  }),
                  component({
                    dimension: "cache_write_5m",
                    amount: "1.25",
                    condition: { promptTokensOver: 200000 },
                  }),
                  component({
                    dimension: "cache_write_5m",
                    amount: "1",
                    condition: { promptTokensAtMost: 200000 },
                  }),
                ],
              }),
            ],
          }),
        ],
      }),
      AS_OF,
    );

    expect(view.price?.components).toEqual([
      priceRow("Cache write (5 minutes)", "$1.25", "prompts over 200,000 tokens"),
      priceRow("Cache write (5 minutes)", "$1", "prompts up to 200,000 tokens"),
      priceRow("Cache write (1 hour)", "$2"),
    ]);
    expect(view.headlines).toEqual([]);
  });

  it("keeps a trailing zero in the decimal string", () => {
    const view = toModelDetailView(
      read({
        offerings: [
          offering({
            openVersions: [
              version({
                components: [component({ dimension: "cache_read", amount: "0.10" })],
              }),
            ],
          }),
        ],
      }),
      AS_OF,
    );

    expect(view.price?.components).toEqual([priceRow("Cache read", "$0.10")]);
  });

  it("labels OpenAI's single cache-write price on its own", () => {
    const view = toModelDetailView(
      read({
        offerings: [
          offering({
            openVersions: [
              version({
                components: [component({ dimension: "cache_write", amount: "12.5" })],
              }),
            ],
          }),
        ],
      }),
      AS_OF,
    );

    expect(view.price?.components[0]?.dimensionLabel).toBe("Cache write");
  });

  it("says the price was announced, and still names the UTC day it was first seen", () => {
    const view = toModelDetailView(
      read({
        offerings: [
          offering({
            openVersions: [
              version({
                firstSeenAt: new Date("2026-06-02T00:30:00.000Z"),
                announcedOn: "2026-06-01",
              }),
            ],
          }),
        ],
      }),
      AS_OF,
    );

    expect(view.price?.dateLine).toBe("Announced for 2026-06-01. First seen 2026-06-02.");
  });

  it("marks a retired model and still shows its current price", () => {
    const view = toModelDetailView(
      read({ deprecatedAt: new Date("2026-10-18T00:00:00.000Z") }),
      AS_OF,
    );

    expect(view.retired).toBe(true);
    expect(view.price).not.toBeNull();
  });

  it("shows no price and no chart when the model has no global offering", () => {
    const view = toModelDetailView(read({ offerings: [] }), AS_OF);

    expect(view.price).toBeNull();
    expect(view.history).toEqual({ series: [], skipped: [] });
    expect(view.headlines).toEqual([]);
    expect(view.events).toEqual([]);
    expect(view.versionCount).toBe(0);
    expect(view.sinceDay).toBeNull();
  });

  it("shows no price when the only global offering has no open version", () => {
    expect(
      toModelDetailView(read({ offerings: [offering({ openVersions: [] })] }), AS_OF).price,
    ).toBeNull();
  });

  it("names a tier in words and leaves an empty condition blank", () => {
    const view = toModelDetailView(
      read({
        offerings: [
          offering({
            openVersions: [
              version({
                components: [
                  component({
                    amount: "0.50",
                    condition: { promptTokensAtMost: 100000 },
                  }),
                  component({ amount: "1" }),
                  component({
                    dimension: "output",
                    amount: "2",
                    condition: { promptTokensOver: 200000 },
                  }),
                ],
              }),
            ],
          }),
        ],
      }),
      AS_OF,
    );

    expect(view.price?.components).toEqual([
      priceRow("Input", "$1"),
      priceRow("Input", "$0.50", "prompts up to 100,000 tokens", "0.5×"),
      priceRow("Output", "$2", "prompts over 200,000 tokens", "2×"),
    ]);
    expect(view.headlines).toEqual([{ label: "Input", amountText: "$1", change: null }]);
  });

  it("treats a repeated copy of the same official URL as one link", () => {
    const view = toModelDetailView(
      read({
        offerings: [offering({ officialSourceUrls: [SOURCE, ` ${SOURCE} `] })],
      }),
      AS_OF,
    );

    expect(view.price?.sourceUrl).toBe(SOURCE);
  });

  it("throws when the model has two global offerings", () => {
    expect(() => toModelDetailView(read({ offerings: [offering(), offering()] }), AS_OF)).toThrow(
      /more than one global offering/,
    );
  });

  it("throws when one offering has two open price versions", () => {
    expect(() =>
      toModelDetailView(
        read({
          offerings: [offering({ openVersions: [version(), version()] })],
        }),
        AS_OF,
      ),
    ).toThrow(/more than one open price version/);
  });

  it("throws when a published price has no official URL", () => {
    expect(() =>
      toModelDetailView(read({ offerings: [offering({ officialSourceUrls: [] })] }), AS_OF),
    ).toThrow(/0 official source urls/);
  });

  it("throws when a published price has a blank official URL", () => {
    expect(() =>
      toModelDetailView(read({ offerings: [offering({ officialSourceUrls: ["  "] })] }), AS_OF),
    ).toThrow(/0 official source urls/);
  });

  it("throws when a published price has two official URLs", () => {
    expect(() =>
      toModelDetailView(
        read({
          offerings: [
            offering({
              officialSourceUrls: [SOURCE, "https://developers.openai.com/api/docs/pricing.md"],
            }),
          ],
        }),
        AS_OF,
      ),
    ).toThrow(/2 official source urls/);
  });

  it("throws when a component unit is not USD per 1M tokens", () => {
    expect(() =>
      toModelDetailView(
        read({
          offerings: [
            offering({
              openVersions: [version({ components: [component({ unit: "usd_per_call" })] })],
            }),
          ],
        }),
        AS_OF,
      ),
    ).toThrow(/unit/);
  });

  it("throws when a dimension is not one we can label", () => {
    expect(() =>
      toModelDetailView(
        read({
          offerings: [
            offering({
              openVersions: [version({ components: [component({ dimension: "audio_input" })] })],
            }),
          ],
        }),
        AS_OF,
      ),
    ).toThrow(/dimension/);
  });

  it("throws when a condition uses a key other than the two prompt tiers", () => {
    expect(() =>
      toModelDetailView(
        read({
          offerings: [
            offering({
              openVersions: [
                version({
                  components: [component({ condition: { promptTokensUnder: 100000 } })],
                }),
              ],
            }),
          ],
        }),
        AS_OF,
      ),
    ).toThrow(/condition/);
  });

  it("throws when a condition sets both prompt tiers at once", () => {
    expect(() =>
      toModelDetailView(
        read({
          offerings: [
            offering({
              openVersions: [
                version({
                  components: [
                    component({
                      condition: { promptTokensAtMost: 100000, promptTokensOver: 100000 },
                    }),
                  ],
                }),
              ],
            }),
          ],
        }),
        AS_OF,
      ),
    ).toThrow(/condition/);
  });

  it("throws when a tier count is not a positive whole number", () => {
    expect(() =>
      toModelDetailView(
        read({
          offerings: [
            offering({
              openVersions: [
                version({
                  components: [component({ condition: { promptTokensAtMost: 0 } })],
                }),
              ],
            }),
          ],
        }),
        AS_OF,
      ),
    ).toThrow(/condition/);
  });

  it("throws when firstSeenAt is not a real time", () => {
    expect(() =>
      toModelDetailView(
        read({
          offerings: [
            offering({
              openVersions: [version({ firstSeenAt: new Date("not-a-date") })],
            }),
          ],
        }),
        AS_OF,
      ),
    ).toThrow(/firstSeenAt/);
  });

  it("skips a tiered input and still shows the current price", () => {
    const view = toModelDetailView(
      read({
        offerings: [
          offering({
            historyVersions: [
              {
                ...version(),
                lastSeenAt: null,
                components: [
                  component({ amount: "1" }),
                  component({ amount: "0.50", condition: { promptTokensAtMost: 100000 } }),
                ],
              },
            ],
          }),
        ],
      }),
      AS_OF,
    );

    expect(view.history).toEqual({
      series: [],
      skipped: [{ dimension: "input", label: "Input" }],
    });
    expect(view.price?.components[0]?.dimensionLabel).toBe("Input");
  });

  it("badges only the headline that changed, and keeps both changes in one log event", () => {
    const older = version({
      firstSeenAt: new Date("2026-01-15T16:00:00.000Z"),
      components: [
        component({ amount: "15" }),
        component({ dimension: "output", amount: "50" }),
      ],
    });
    const current = version({
      components: [
        component({ amount: "10" }),
        component({ dimension: "output", amount: "40" }),
      ],
    });
    const view = toModelDetailView(
      read({
        offerings: [
          offering({
            openVersions: [current],
            historyVersions: [
              { ...older, lastSeenAt: new Date("2026-05-20T16:00:00.000Z") },
              { ...current, lastSeenAt: null },
            ],
          }),
        ],
      }),
      AS_OF,
    );

    expect(view.versionCount).toBe(2);
    expect(view.sinceDay).toBe("2026-01-15");
    expect(view.headlines).toEqual([
      {
        label: "Input",
        amountText: "$10",
        change: {
          direction: "down",
          pctText: "33.33",
          previousAmountText: "$15",
          previousDateLine: "Changed on or before 2026-01-15.",
        },
      },
      {
        label: "Output",
        amountText: "$40",
        change: {
          direction: "down",
          pctText: "20",
          previousAmountText: "$50",
          previousDateLine: "Changed on or before 2026-01-15.",
        },
      },
    ]);
    expect(view.events).toEqual([
      {
        dateLine: "Changed on or before 2026-10-18.",
        changes: [
          {
            dimensionLabel: "Input",
            conditionLabel: "",
            fromAmountText: "$15",
            toAmountText: "$10",
            direction: "down",
            pctText: "33.33",
          },
          {
            dimensionLabel: "Output",
            conditionLabel: "",
            fromAmountText: "$50",
            toAmountText: "$40",
            direction: "down",
            pctText: "20",
          },
        ],
      },
    ]);
    expect(view.price?.components[0]?.lastChange).toEqual({
      direction: "down",
      pctText: "33.33",
      dateLine: "Changed on or before 2026-10-18.",
    });
    expect(view.price?.components.find((row) => row.dimensionLabel === "Output")?.multiplierText).toBe(
      "4×",
    );
  });

  it("does not badge a headline whose latest amount matches the previous version", () => {
    const first = version({
      firstSeenAt: new Date("2026-01-15T16:00:00.000Z"),
      components: [
        component({ amount: "15" }),
        component({ dimension: "output", amount: "5" }),
      ],
    });
    const middle = version({
      firstSeenAt: new Date("2026-06-02T16:00:00.000Z"),
      components: [
        component({ amount: "10" }),
        component({ dimension: "output", amount: "5" }),
      ],
    });
    const current = version({
      components: [
        component({ amount: "10" }),
        component({ dimension: "output", amount: "8" }),
      ],
    });
    const view = toModelDetailView(
      read({
        offerings: [
          offering({
            openVersions: [current],
            historyVersions: [
              { ...first, lastSeenAt: new Date("2026-05-20T16:00:00.000Z") },
              { ...middle, lastSeenAt: new Date("2026-06-20T16:00:00.000Z") },
              { ...current, lastSeenAt: null },
            ],
          }),
        ],
      }),
      AS_OF,
    );

    expect(view.headlines[0]?.change).toBeNull();
    expect(view.headlines[1]?.change).toMatchObject({
      direction: "up",
      pctText: "60",
      previousAmountText: "$5",
      previousDateLine: "Changed on or before 2026-06-02.",
    });
    expect(view.price?.components[0]?.lastChange?.dateLine).toBe(
      "Changed on or before 2026-06-02.",
    );
    expect(view.events.map((event) => event.changes.map((change) => change.dimensionLabel))).toEqual([
      ["Output"],
      ["Input"],
    ]);
  });

  it("omits a tiered headline and still shows the other one", () => {
    const view = toModelDetailView(
      read({
        offerings: [
          offering({
            openVersions: [
              version({
                components: [
                  component({ amount: "0.50", condition: { promptTokensAtMost: 100000 } }),
                  component({ dimension: "output", amount: "2" }),
                ],
              }),
            ],
          }),
        ],
      }),
      AS_OF,
    );

    expect(view.headlines).toEqual([{ label: "Output", amountText: "$2", change: null }]);
  });

  it("leaves the multiplier blank when input is zero", () => {
    const view = toModelDetailView(
      read({
        offerings: [
          offering({
            openVersions: [
              version({
                components: [
                  component({ amount: "0" }),
                  component({ dimension: "output", amount: "5" }),
                ],
              }),
            ],
          }),
        ],
      }),
      AS_OF,
    );

    expect(view.price?.components.map((row) => row.multiplierText)).toEqual([null, null]);
  });

  it("throws when announcedOn is not a calendar day", () => {
    expect(() =>
      toModelDetailView(
        read({
          offerings: [
            offering({
              openVersions: [version({ announcedOn: "June 1" })],
            }),
          ],
        }),
        AS_OF,
      ),
    ).toThrow(/announcedOn/);
  });

  it("keeps the published amounts when a change is flagged", () => {
    const view = toModelDetailView(
      read({
        offerings: [offering({ reviewStatuses: ["confirmed", "flagged"] })],
      }),
      AS_OF,
    );

    expect(view.changeUnderReview).toBe(true);
    expect(view.price?.components.map((row) => row.amountText)).toEqual([
      "$10",
      "$0.25",
      "$50",
      "$12.5",
      "$20",
    ]);
  });

  it("throws when a review status is not known", () => {
    expect(() =>
      toModelDetailView(
        read({
          offerings: [offering({ reviewStatuses: ["maybe"] })],
        }),
        AS_OF,
      ),
    ).toThrow(/review status maybe is not known/);
  });
});
