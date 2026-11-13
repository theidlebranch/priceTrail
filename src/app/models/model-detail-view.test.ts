import { describe, expect, it } from "vitest";
import {
  toModelDetailView,
  type ModelDetailPriceRow,
  type ModelDetailRead,
} from "./model-detail-view";

const SOURCE = "https://platform.claude.com/docs/en/about-claude/pricing.md";
const ARCHIVE = `https://web.archive.org/web/20261018233000/${SOURCE}`;
const OLDER_ARCHIVE = `https://web.archive.org/web/20260115160000/${SOURCE}`;
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
    archiveUrl: null,
    archiveStatus: null,
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
  id: string = dimension,
  note: string | null = null,
) {
  return {
    id,
    dimension,
    label,
    note,
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
      tiers: [
        {
          label: null,
          headlines: [
            { label: "Input", amountText: "$10", change: null },
            { label: "Output", amountText: "$50", change: null },
          ],
          rows: [
            priceRow("Input", "$10"),
            priceRow("Cache read", "$0.25", "", "0.025×"),
            priceRow("Output", "$50", "", "5×"),
            priceRow("Cache write (5 minutes)", "$12.5", "", "1.25×"),
            priceRow("Cache write (1 hour)", "$20", "", "2×"),
          ],
          series: [
            openSeries("input", "Input", "10", 10),
            openSeries("cache_read", "Cache read", "0.25", 0.25),
            openSeries("output", "Output", "50", 50),
            openSeries("cache_write_5m", "Cache write (5 minutes)", "12.5", 12.5),
            openSeries("cache_write_1h", "Cache write (1 hour)", "20", 20),
          ],
        },
      ],
      events: [],
      startingPrice: null,
      price: {
        dateLine: "Changed on or before 2026-10-18.",
        sourceUrl: SOURCE,
        sourceLabel: "Official pricing page",
        proof: { kind: "missing", text: "No archived snapshot." },
        components: [
          priceRow("Input", "$10"),
          priceRow("Cache read", "$0.25", "", "0.025×"),
          priceRow("Output", "$50", "", "5×"),
          priceRow("Cache write (5 minutes)", "$12.5", "", "1.25×"),
          priceRow("Cache write (1 hour)", "$20", "", "2×"),
        ],
        groups: [
          {
            heading: null,
            rows: [
              priceRow("Input", "$10"),
              priceRow("Cache read", "$0.25", "", "0.025×"),
              priceRow("Output", "$50", "", "5×"),
              priceRow("Cache write (5 minutes)", "$12.5", "", "1.25×"),
              priceRow("Cache write (1 hour)", "$20", "", "2×"),
            ],
          },
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
        bounds: [],
        notes: [],
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

    expect(view.price?.groups).toEqual([
      { heading: null, rows: [priceRow("Cache write (1 hour)", "$2")] },
      {
        heading: "Up to 200,000 tokens",
        rows: [priceRow("Cache write (5 minutes)", "$1")],
      },
      {
        heading: "Over 200,000 tokens",
        rows: [priceRow("Cache write (5 minutes)", "$1.25")],
      },
    ]);
    expect(view.tiers.map((tier) => tier.label)).toEqual([
      "Up to 200,000 tokens",
      "Over 200,000 tokens",
    ]);
    expect(view.tiers[0]?.rows.map((row) => row.dimensionLabel)).toEqual([
      "Cache write (1 hour)",
      "Cache write (5 minutes)",
    ]);
    expect(view.tiers[1]?.rows).toEqual([priceRow("Cache write (5 minutes)", "$1.25")]);
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
    expect(view.history).toEqual({ series: [], skipped: [], bounds: [], notes: [] });
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

  it("names a long-context price whose cutoff is not stated and keeps the short price as the headline", () => {
    const current = version({
      components: [
        component({ amount: "2" }),
        component({ amount: "4", condition: { longContext: true } }),
      ],
    });
    const view = toModelDetailView(
      read({
        offerings: [
          offering({
            openVersions: [current],
            historyVersions: [{ ...current, lastSeenAt: null }],
          }),
        ],
      }),
      AS_OF,
    );

    expect(view.headlines).toEqual([{ label: "Input", amountText: "$2", change: null }]);
    expect(view.price?.groups).toEqual([
      { heading: "Up to 272,000 tokens", rows: [priceRow("Input", "$2")] },
      { heading: "Over 272,000 tokens", rows: [priceRow("Input", "$4")] },
    ]);
    expect(view.tiers.map((tier) => tier.label)).toEqual([
      "Up to 272,000 tokens",
      "Over 272,000 tokens",
    ]);
    expect(view.tiers[0]?.headlines).toEqual([{ label: "Input", amountText: "$2", change: null }]);
    expect(view.tiers[1]?.headlines).toEqual([{ label: "Input", amountText: "$4", change: null }]);
    expect(view.tiers[1]?.rows).toEqual([priceRow("Input", "$4")]);
    expect(view.tiers[1]?.series).toEqual([
      openSeries("input", "Input", "4", 4, "input:longContext"),
    ]);
    expect(view.history.series).toEqual([
      openSeries("input", "Input", "2", 2),
      openSeries("input", "Input, long context", "4", 4, "input:longContext"),
    ]);
    expect(view.history.skipped).toEqual([]);
    expect(view.history.notes).toEqual([]);
  });

  it("groups a 200,000 pair and keeps that cutoff off the 272,000 guess", () => {
    const tier = (dimension: "input" | "output" | "cache_read", short: string, long: string) => [
      component({
        dimension,
        amount: short,
        condition: { promptTokensAtMost: 200000 },
      }),
      component({
        dimension,
        amount: long,
        condition: { promptTokensOver: 200000 },
      }),
    ];
    const current = version({
      components: [
        ...tier("input", "1.25", "2.5"),
        ...tier("output", "10", "15"),
        ...tier("cache_read", "0.125", "0.25"),
      ],
    });
    const view = toModelDetailView(
      read({
        labName: "Google",
        modelName: "Gemini 2.5 Pro",
        offerings: [
          offering({
            openVersions: [current],
            historyVersions: [{ ...current, lastSeenAt: null }],
          }),
        ],
      }),
      AS_OF,
    );

    expect(view.headlines).toEqual([
      { label: "Input", amountText: "$1.25", change: null },
      { label: "Output", amountText: "$10", change: null },
    ]);
    expect(view.tiers.map((tier) => tier.label)).toEqual([
      "Up to 200,000 tokens",
      "Over 200,000 tokens",
    ]);
    expect(view.tiers[0]?.headlines).toEqual([
      { label: "Input", amountText: "$1.25", change: null },
      { label: "Output", amountText: "$10", change: null },
    ]);
    expect(view.tiers[1]?.headlines).toEqual([
      { label: "Input", amountText: "$2.5", change: null },
      { label: "Output", amountText: "$15", change: null },
    ]);
    expect(view.tiers[0]?.rows.map((row) => row.multiplierText)).toEqual([null, "0.1×", "8×"]);
    expect(view.tiers[1]?.rows.map((row) => row.multiplierText)).toEqual([null, "0.1×", "6×"]);
    expect(view.tiers[0]?.series.map((item) => item.id)).toEqual(["input", "cache_read", "output"]);
    expect(view.tiers[1]?.series.map((item) => ({ id: item.id, label: item.label }))).toEqual([
      { id: "input:longContext", label: "Input" },
      { id: "cache_read:longContext", label: "Cache read" },
      { id: "output:longContext", label: "Output" },
    ]);
    expect(view.price?.groups?.map((group) => group.heading)).toEqual([
      "Up to 200,000 tokens",
      "Over 200,000 tokens",
    ]);
    expect(view.price?.groups?.[0]?.rows.map((row) => row.dimensionLabel)).toEqual([
      "Input",
      "Cache read",
      "Output",
    ]);
    expect(view.history.notes).toEqual([]);
    expect(view.history.skipped).toEqual([]);
    expect(view.history.series.map((item) => item.id)).toEqual([
      "input",
      "input:longContext",
      "cache_read",
      "cache_read:longContext",
      "output",
      "output:longContext",
    ]);
  });

  it("does not list a filled-in 272,000 cutoff as a change", () => {
    const older = version({
      firstSeenAt: new Date("2026-10-18T00:00:00.000Z"),
      components: [
        component({ amount: "2" }),
        component({ amount: "4", condition: { longContext: true } }),
      ],
    });
    const current = version({
      firstSeenAt: new Date("2026-11-10T00:00:00.000Z"),
      components: [
        component({ amount: "2", condition: { promptTokensAtMost: 272000 } }),
        component({ amount: "4", condition: { promptTokensOver: 272000 } }),
      ],
    });
    const view = toModelDetailView(
      read({
        offerings: [
          offering({
            openVersions: [current],
            historyVersions: [
              { ...older, lastSeenAt: new Date("2026-11-10T00:00:00.000Z") },
              { ...current, lastSeenAt: null },
            ],
          }),
        ],
      }),
      new Date("2026-11-10T12:00:00.000Z"),
    );

    expect(view.events).toEqual([]);
    expect(view.headlines[0]?.change).toBeNull();
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

  it("charts the short input and names the known token bound", () => {
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

    expect(view.history.series).toEqual([openSeries("input", "Input", "1", 1)]);
    expect(view.history.skipped).toEqual([]);
    expect(view.history.notes).toEqual([
      "Input also has a price for prompts up to 100,000 tokens, $0.50. It is not on this chart.",
    ]);
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
        proof: { kind: "missing", text: "No archived snapshot." },
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
    expect(view.startingPrice).toEqual({
      dateLine: "Changed on or before 2026-01-15.",
      proof: { kind: "missing", text: "No archived snapshot." },
    });
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

  it("links the snapshot that opened the current price and keeps the live page", () => {
    const view = toModelDetailView(
      read({
        offerings: [
          offering({
            openVersions: [version({ archiveUrl: ARCHIVE, archiveStatus: "archived" })],
            historyVersions: [
              {
                ...version({ archiveUrl: ARCHIVE, archiveStatus: "archived" }),
                lastSeenAt: null,
              },
            ],
          }),
        ],
      }),
      AS_OF,
    );

    expect(view.price?.sourceUrl).toBe(SOURCE);
    expect(view.price?.sourceLabel).toBe("Official pricing page");
    expect(view.price?.proof).toEqual({
      kind: "link",
      url: ARCHIVE,
      text: "Archived snapshot",
    });
    expect(view.startingPrice).toBeNull();
  });

  it("says the opening snapshot was not archived when Wayback failed", () => {
    const view = toModelDetailView(
      read({
        offerings: [
          offering({
            openVersions: [version({ archiveStatus: "failed" })],
            historyVersions: [{ ...version({ archiveStatus: "failed" }), lastSeenAt: null }],
          }),
        ],
      }),
      AS_OF,
    );

    expect(view.price?.proof).toEqual({ kind: "missing", text: "No archived snapshot." });
  });

  it("gives the later price and the starting price their own snapshots", () => {
    const older = version({
      firstSeenAt: new Date("2026-01-15T16:00:00.000Z"),
      archiveUrl: OLDER_ARCHIVE,
      archiveStatus: "archived",
      components: [component({ amount: "15" })],
    });
    const current = version({
      archiveUrl: ARCHIVE,
      archiveStatus: "archived",
      components: [component({ amount: "10" })],
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

    expect(view.price?.proof).toEqual({ kind: "link", url: ARCHIVE, text: "Archived snapshot" });
    expect(view.events[0]?.proof).toEqual({
      kind: "link",
      url: ARCHIVE,
      text: "Archived snapshot",
    });
    expect(view.startingPrice).toEqual({
      dateLine: "Changed on or before 2026-01-15.",
      proof: { kind: "link", url: OLDER_ARCHIVE, text: "Archived snapshot" },
    });
  });

  it("throws when the stored archive URL is not a Wayback permalink", () => {
    expect(() =>
      toModelDetailView(
        read({
          offerings: [
            offering({
              openVersions: [
                version({ archiveUrl: "https://example.test/pricing", archiveStatus: "archived" }),
              ],
              historyVersions: [
                {
                  ...version({
                    archiveUrl: "https://example.test/pricing",
                    archiveStatus: "archived",
                  }),
                  lastSeenAt: null,
                },
              ],
            }),
          ],
        }),
        AS_OF,
      ),
    ).toThrow(/Wayback permalink/);
  });

  it("throws when a pending snapshot already has a permalink", () => {
    expect(() =>
      toModelDetailView(
        read({
          offerings: [
            offering({
              openVersions: [version({ archiveUrl: ARCHIVE, archiveStatus: "pending" })],
              historyVersions: [
                { ...version({ archiveUrl: ARCHIVE, archiveStatus: "pending" }), lastSeenAt: null },
              ],
            }),
          ],
        }),
        AS_OF,
      ),
    ).toThrow(/Wayback permalink/);
  });
});
