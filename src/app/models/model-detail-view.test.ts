import { describe, expect, it } from "vitest";
import { toModelDetailView, type ModelDetailRead } from "./model-detail-view";

const SOURCE = "https://platform.claude.com/docs/en/about-claude/pricing.md";

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
  return {
    openVersions: [version()],
    officialSourceUrls: [SOURCE],
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
    expect(toModelDetailView(read())).toEqual({
      labName: "Anthropic",
      modelName: "Claude Fable 5.1",
      retired: false,
      price: {
        dateLine: "Changed on or before 2026-10-18.",
        sourceUrl: SOURCE,
        sourceLabel: "Official pricing page",
        components: [
          { dimensionLabel: "Input", amountText: "$10", conditionLabel: "" },
          { dimensionLabel: "Output", amountText: "$50", conditionLabel: "" },
          { dimensionLabel: "Cache read", amountText: "$0.25", conditionLabel: "" },
          { dimensionLabel: "Cache write (5 minutes)", amountText: "$12.5", conditionLabel: "" },
          { dimensionLabel: "Cache write (1 hour)", amountText: "$20", conditionLabel: "" },
        ],
      },
    });
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
    );

    expect(view.price?.components).toEqual([
      { dimensionLabel: "Cache read", amountText: "$0.10", conditionLabel: "" },
    ]);
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
    );

    expect(view.price?.dateLine).toBe("Announced for 2026-06-01. First seen 2026-06-02.");
  });

  it("marks a retired model and still shows its current price", () => {
    const view = toModelDetailView(
      read({ deprecatedAt: new Date("2026-10-18T00:00:00.000Z") }),
    );

    expect(view.retired).toBe(true);
    expect(view.price).not.toBeNull();
  });

  it("shows no price when the model has no global offering", () => {
    expect(toModelDetailView(read({ offerings: [] })).price).toBeNull();
  });

  it("shows no price when the only global offering has no open version", () => {
    expect(
      toModelDetailView(read({ offerings: [offering({ openVersions: [] })] })).price,
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
    );

    expect(view.price?.components).toEqual([
      { dimensionLabel: "Input", amountText: "$1", conditionLabel: "" },
      {
        dimensionLabel: "Input",
        amountText: "$0.50",
        conditionLabel: "prompts up to 100,000 tokens",
      },
      {
        dimensionLabel: "Output",
        amountText: "$2",
        conditionLabel: "prompts over 200,000 tokens",
      },
    ]);
  });

  it("treats a repeated copy of the same official URL as one link", () => {
    const view = toModelDetailView(
      read({
        offerings: [offering({ officialSourceUrls: [SOURCE, ` ${SOURCE} `] })],
      }),
    );

    expect(view.price?.sourceUrl).toBe(SOURCE);
  });

  it("throws when the model has two global offerings", () => {
    expect(() => toModelDetailView(read({ offerings: [offering(), offering()] }))).toThrow(
      /more than one global offering/,
    );
  });

  it("throws when one offering has two open price versions", () => {
    expect(() =>
      toModelDetailView(
        read({
          offerings: [offering({ openVersions: [version(), version()] })],
        }),
      ),
    ).toThrow(/more than one open price version/);
  });

  it("throws when a published price has no official URL", () => {
    expect(() =>
      toModelDetailView(read({ offerings: [offering({ officialSourceUrls: [] })] })),
    ).toThrow(/0 official source urls/);
  });

  it("throws when a published price has a blank official URL", () => {
    expect(() =>
      toModelDetailView(read({ offerings: [offering({ officialSourceUrls: ["  "] })] })),
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
      ),
    ).toThrow(/firstSeenAt/);
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
      ),
    ).toThrow(/announcedOn/);
  });
});
