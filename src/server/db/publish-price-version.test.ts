// @vitest-environment node

/**
 * Input checks run without a database, so CI still sees them fail on purpose.
 * The writes talk to Neon. They skip when DATABASE_URL is missing. Each
 * database test rolls its transaction back, so a passing run leaves no rows.
 *
 * Local run:
 * node --env-file=.env ./node_modules/vitest/vitest.mjs run src/server/db/publish-price-version.test.ts
 *
 * parsed_data is {} in these tests. publishPriceVersion does not read it.
 * The empty object only lets the snapshot row exist. The later pipeline fills it.
 */
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb } from "@/server/db/client";
import {
  publishPriceVersion,
  type PriceComponentInput,
  type PublishDb,
  type PublishPriceVersionInput,
} from "@/server/db/publish-price-version";
import {
  createCatalogRepository,
  requireInsertedRow,
} from "@/server/db/repositories/catalog";
import {
  observationItems,
  observations,
  priceComponents,
  priceVersions,
  sources,
} from "@/server/db/schema";
import { parseDatabaseEnv } from "@/server/env";

const FIRST_SEEN = new Date("2026-01-15T16:00:00.000Z");
const LAST_SEEN = new Date("2026-05-20T16:00:00.000Z");
const NEXT_SEEN = new Date("2026-06-02T16:00:00.000Z");
const RETRACTED = new Date("2026-06-03T16:00:00.000Z");
const ANNOUNCED_ON = "2026-06-01";

const databaseUrl = process.env.DATABASE_URL?.trim() ?? "";

describe("publishPriceVersion input checks", () => {
  it("throws when the component list is empty", async () => {
    await expect(
      publishPriceVersion(untouchedDb(), priceInput({ components: [] })),
    ).rejects.toThrow(/at least one component/);
  });

  it("throws when two components share a dimension and condition", async () => {
    await expect(
      publishPriceVersion(
        untouchedDb(),
        priceInput({
          components: [
            { dimension: "input", unit: "usd_per_1m_tokens", amount: "1" },
            { dimension: "input", unit: "usd_per_1m_tokens", amount: "2" },
          ],
        }),
      ),
    ).rejects.toThrow(/same dimension and condition/);
  });

  it("throws when the same tier is repeated with its keys in another order", async () => {
    await expect(
      publishPriceVersion(
        untouchedDb(),
        priceInput({
          components: [
            {
              dimension: "input",
              unit: "usd_per_1m_tokens",
              amount: "1",
              condition: { promptTokensOver: 200000, promptTokensAtMost: 100000 },
            },
            {
              dimension: "input",
              unit: "usd_per_1m_tokens",
              amount: "0.50",
              condition: { promptTokensAtMost: 100000, promptTokensOver: 200000 },
            },
          ],
        }),
      ),
    ).rejects.toThrow(/same dimension and condition/);
  });

  it("throws when the amount is negative", async () => {
    await expect(
      publishPriceVersion(untouchedDb(), priceInput({ components: [component({ amount: "-1" })] })),
    ).rejects.toThrow(/non-negative decimal string/);
  });

  it("throws when the amount is not a decimal string", async () => {
    await expect(
      publishPriceVersion(
        untouchedDb(),
        priceInput({ components: [component({ amount: "1.25abc" })] }),
      ),
    ).rejects.toThrow(/non-negative decimal string/);
  });

  it("throws when the unit is not USD per 1 million tokens", async () => {
    await expect(
      publishPriceVersion(
        untouchedDb(),
        priceInput({ components: [component({ unit: "usd" })] }),
      ),
    ).rejects.toThrow(/usd_per_1m_tokens/);
  });

  it("throws when the dimension is not one this table stores", async () => {
    await expect(
      publishPriceVersion(
        untouchedDb(),
        priceInput({ components: [component({ dimension: "audio_input" })] }),
      ),
    ).rejects.toThrow(/dimension/);
  });

  it("throws when the condition is not a known tier", async () => {
    await expect(
      publishPriceVersion(
        untouchedDb(),
        priceInput({
          components: [component({ condition: { promptTokensAtMost: -1 } })],
        }),
      ),
    ).rejects.toThrow(/condition/);
  });

  it("throws when announcedOn is not a real calendar day", async () => {
    await expect(
      publishPriceVersion(untouchedDb(), priceInput({ announcedOn: "2026-13-40" })),
    ).rejects.toThrow(/YYYY-MM-DD/);
  });

  it("throws when firstSeenAt is not a real time", async () => {
    await expect(
      publishPriceVersion(untouchedDb(), priceInput({ firstSeenAt: new Date("not-a-date") })),
    ).rejects.toThrow(/firstSeenAt/);
  });

  it("throws when previousLastSeenAt is not a real time", async () => {
    await expect(
      publishPriceVersion(
        untouchedDb(),
        priceInput({ previousLastSeenAt: new Date("not-a-date") }),
      ),
    ).rejects.toThrow(/previousLastSeenAt must be a valid date/);
  });

  it("throws when retractedAt is not a real time", async () => {
    await expect(
      publishPriceVersion(
        untouchedDb(),
        priceInput({
          replacesVersionId: 4,
          retractedAt: new Date("not-a-date"),
        }),
      ),
    ).rejects.toThrow(/retractedAt must be a valid date/);
  });

  it("throws when previousLastSeenAt equals firstSeenAt", async () => {
    await expect(
      publishPriceVersion(
        untouchedDb(),
        priceInput({
          firstSeenAt: NEXT_SEEN,
          previousLastSeenAt: NEXT_SEEN,
        }),
      ),
    ).rejects.toThrow(/previousLastSeenAt must be before firstSeenAt/);
  });

  it("throws when previousLastSeenAt is after firstSeenAt", async () => {
    await expect(
      publishPriceVersion(
        untouchedDb(),
        priceInput({
          firstSeenAt: LAST_SEEN,
          previousLastSeenAt: NEXT_SEEN,
        }),
      ),
    ).rejects.toThrow(/previousLastSeenAt must be before firstSeenAt/);
  });

  it("throws when a correction also tries to close a period", async () => {
    await expect(
      publishPriceVersion(
        untouchedDb(),
        priceInput({
          replacesVersionId: 4,
          retractedAt: RETRACTED,
          previousLastSeenAt: LAST_SEEN,
        }),
      ),
    ).rejects.toThrow(/cannot both be set/);
  });

  it("throws when a correction has no retractedAt", async () => {
    await expect(
      publishPriceVersion(untouchedDb(), priceInput({ replacesVersionId: 4 })),
    ).rejects.toThrow(/retractedAt is required/);
  });

  it("throws when retractedAt is set without a version to replace", async () => {
    await expect(
      publishPriceVersion(untouchedDb(), priceInput({ retractedAt: RETRACTED })),
    ).rejects.toThrow(/retractedAt cannot be set unless replacesVersionId is set/);
  });
});

describe.skipIf(databaseUrl.length === 0)("publishPriceVersion", () => {
  let close: (() => Promise<void>) | undefined;
  let db: ReturnType<typeof createDb>["db"];

  beforeAll(() => {
    const parsed = parseDatabaseEnv({ DATABASE_URL: databaseUrl });
    const opened = createDb(parsed.databaseUrl);
    db = opened.db;
    close = () => opened.close();
  });

  afterAll(async () => {
    await close?.();
  });

  it("opens a first period, then closes it at the last sighting of the old price", async () => {
    await withPublish(async (tx) => {
      const offering = await seedOffering(tx);
      const item = await seedItem(tx, offering.id, "ok");

      const opened = await publishPriceVersion(
        tx,
        priceInput({
          observationItemId: item.id,
          firstSeenAt: FIRST_SEEN,
          components: [component({ amount: "1.25" })],
        }),
      );

      expect(opened.precision).toEqual({
        kind: "observed",
        chartStart: "2026-01-15",
        wording: "changed on or before",
      });

      const changed = await publishPriceVersion(
        tx,
        priceInput({
          observationItemId: item.id,
          firstSeenAt: NEXT_SEEN,
          previousLastSeenAt: LAST_SEEN,
          components: [
            component({ amount: "1" }),
            component({ dimension: "cache_write_5m", amount: "1.25" }),
            component({ dimension: "cache_write_1h", amount: "2" }),
            component({ dimension: "cache_read", amount: "0.10" }),
            component({ dimension: "output", amount: "5" }),
          ],
        }),
      );

      expect(changed.precision).toEqual({
        kind: "observed",
        chartStart: "2026-06-02",
        wording: "changed on or before",
      });

      const versions = await versionsFor(tx, offering.id);
      expect(versions).toHaveLength(2);
      expect(versions[0]).toMatchObject({
        id: opened.priceVersionId,
        firstSeenAt: FIRST_SEEN,
        announcedOn: null,
        lastSeenAt: LAST_SEEN,
        retractedAt: null,
        replacesVersionId: null,
      });
      expect(versions[1]).toMatchObject({
        id: changed.priceVersionId,
        firstSeenAt: NEXT_SEEN,
        announcedOn: null,
        lastSeenAt: null,
        retractedAt: null,
        replacesVersionId: null,
      });
      expect(await amountsFor(tx, opened.priceVersionId)).toEqual([
        { dimension: "input", amount: "1.25", condition: {} },
      ]);
      expect(await amountsFor(tx, changed.priceVersionId)).toEqual([
        { dimension: "input", amount: "1", condition: {} },
        { dimension: "cache_write_5m", amount: "1.25", condition: {} },
        { dimension: "cache_write_1h", amount: "2", condition: {} },
        { dimension: "cache_read", amount: "0.10", condition: {} },
        { dimension: "output", amount: "5", condition: {} },
      ]);
    });
  });

  it("keeps the fetch time when a source named an earlier day", async () => {
    await withPublish(async (tx) => {
      const offering = await seedOffering(tx);
      const item = await seedItem(tx, offering.id, "ok");
      const published = await publishPriceVersion(
        tx,
        priceInput({
          observationItemId: item.id,
          firstSeenAt: NEXT_SEEN,
          announcedOn: ANNOUNCED_ON,
        }),
      );

      expect(published.precision).toEqual({
        kind: "announced",
        chartStart: ANNOUNCED_ON,
      });
      const [version] = await versionsFor(tx, offering.id);
      expect(version?.firstSeenAt).toEqual(NEXT_SEEN);
      expect(version?.announcedOn).toBe(ANNOUNCED_ON);
    });
  });

  it("retracts a wrong open row and points the fix at it", async () => {
    await withPublish(async (tx) => {
      const offering = await seedOffering(tx);
      const item = await seedItem(tx, offering.id, "ok");
      const wrong = await publishPriceVersion(
        tx,
        priceInput({
          observationItemId: item.id,
          firstSeenAt: NEXT_SEEN,
          components: [component({ amount: "0.80" })],
        }),
      );
      const fix = await publishPriceVersion(
        tx,
        priceInput({
          observationItemId: item.id,
          firstSeenAt: NEXT_SEEN,
          replacesVersionId: wrong.priceVersionId,
          retractedAt: RETRACTED,
          components: [component({ amount: "1" })],
        }),
      );

      const versions = await versionsFor(tx, offering.id);
      expect(versions).toHaveLength(2);
      expect(versions[0]).toMatchObject({
        id: wrong.priceVersionId,
        firstSeenAt: NEXT_SEEN,
        lastSeenAt: null,
        retractedAt: RETRACTED,
        replacesVersionId: null,
      });
      expect(versions[1]).toMatchObject({
        id: fix.priceVersionId,
        firstSeenAt: NEXT_SEEN,
        lastSeenAt: null,
        retractedAt: null,
        replacesVersionId: wrong.priceVersionId,
      });
      expect(versions.filter((version) => version.retractedAt === null)).toHaveLength(1);
    });
  });

  it("accepts review_status confirmed", async () => {
    await withPublish(async (tx) => {
      const offering = await seedOffering(tx);
      const item = await seedItem(tx, offering.id, "confirmed");
      const published = await publishPriceVersion(
        tx,
        priceInput({ observationItemId: item.id, components: [component({ amount: "0" })] }),
      );

      expect(published.priceVersionId).toEqual(expect.any(Number));
      expect(await amountsFor(tx, published.priceVersionId)).toEqual([
        { dimension: "input", amount: "0", condition: {} },
      ]);
    });
  });

  it("throws when review_status is flagged", async () => {
    await withPublish(async (tx) => {
      const offering = await seedOffering(tx);
      const item = await seedItem(tx, offering.id, "flagged");
      await expect(
        publishPriceVersion(tx, priceInput({ observationItemId: item.id })),
      ).rejects.toThrow(/only ok and confirmed/);
    });
  });

  it("throws when review_status is rejected", async () => {
    await withPublish(async (tx) => {
      const offering = await seedOffering(tx);
      const item = await seedItem(tx, offering.id, "rejected");
      await expect(
        publishPriceVersion(tx, priceInput({ observationItemId: item.id })),
      ).rejects.toThrow(/only ok and confirmed/);
    });
  });

  it("throws when review_status was left as the database default", async () => {
    await withPublish(async (tx) => {
      const offering = await seedOffering(tx);
      const item = await seedItem(tx, offering.id);
      expect(item.reviewStatus).toBe("flagged");
      await expect(
        publishPriceVersion(tx, priceInput({ observationItemId: item.id })),
      ).rejects.toThrow(/only ok and confirmed/);
    });
  });

  it("throws when the observation item does not exist", async () => {
    await withPublish(async (tx) => {
      await expect(
        publishPriceVersion(tx, priceInput({ observationItemId: missingId })),
      ).rejects.toThrow(/does not exist/);
    });
  });

  it("throws when an open version exists and previousLastSeenAt is missing", async () => {
    await withPublish(async (tx) => {
      const offering = await seedOffering(tx);
      const item = await seedItem(tx, offering.id, "ok");
      await publishPriceVersion(tx, priceInput({ observationItemId: item.id, firstSeenAt: FIRST_SEEN }));
      await expect(
        publishPriceVersion(
          tx,
          priceInput({
            observationItemId: item.id,
            firstSeenAt: NEXT_SEEN,
            components: [component({ amount: "1" })],
          }),
        ),
      ).rejects.toThrow(/previousLastSeenAt is required/);
      expect(await versionsFor(tx, offering.id)).toHaveLength(1);
    });
  });

  it("throws when previousLastSeenAt is set and nothing is open", async () => {
    await withPublish(async (tx) => {
      const offering = await seedOffering(tx);
      const item = await seedItem(tx, offering.id, "ok");
      await expect(
        publishPriceVersion(
          tx,
          priceInput({
            observationItemId: item.id,
            firstSeenAt: NEXT_SEEN,
            previousLastSeenAt: LAST_SEEN,
          }),
        ),
      ).rejects.toThrow(/no open price version to close/);
      expect(await versionsFor(tx, offering.id)).toHaveLength(0);
    });
  });

  it("throws when previousLastSeenAt is before the open version started", async () => {
    await withPublish(async (tx) => {
      const offering = await seedOffering(tx);
      const item = await seedItem(tx, offering.id, "ok");
      await publishPriceVersion(
        tx,
        priceInput({ observationItemId: item.id, firstSeenAt: NEXT_SEEN }),
      );
      await expect(
        publishPriceVersion(
          tx,
          priceInput({
            observationItemId: item.id,
            firstSeenAt: RETRACTED,
            previousLastSeenAt: LAST_SEEN,
            components: [component({ amount: "1" })],
          }),
        ),
      ).rejects.toThrow(/before the open version started/);
    });
  });

  it("throws when the new components match the open version", async () => {
    await withPublish(async (tx) => {
      const offering = await seedOffering(tx);
      const item = await seedItem(tx, offering.id, "ok");
      await publishPriceVersion(
        tx,
        priceInput({
          observationItemId: item.id,
          firstSeenAt: FIRST_SEEN,
          components: [component({ amount: "1.25" })],
        }),
      );
      await expect(
        publishPriceVersion(
          tx,
          priceInput({
            observationItemId: item.id,
            firstSeenAt: NEXT_SEEN,
            previousLastSeenAt: LAST_SEEN,
            components: [component({ amount: "1.25", condition: {} })],
          }),
        ),
      ).rejects.toThrow(/matches the open version/);
      expect(await versionsFor(tx, offering.id)).toHaveLength(1);
    });
  });

  it("throws when the same amount is written with extra zeros", async () => {
    await withPublish(async (tx) => {
      const offering = await seedOffering(tx);
      const item = await seedItem(tx, offering.id, "ok");
      await publishPriceVersion(
        tx,
        priceInput({
          observationItemId: item.id,
          firstSeenAt: FIRST_SEEN,
          components: [component({ amount: "1" })],
        }),
      );
      await expect(
        publishPriceVersion(
          tx,
          priceInput({
            observationItemId: item.id,
            firstSeenAt: NEXT_SEEN,
            previousLastSeenAt: LAST_SEEN,
            components: [component({ amount: "1.00" })],
          }),
        ),
      ).rejects.toThrow(/matches the open version/);
    });
  });

  it("opens a new period when the same dimension gains a tier", async () => {
    await withPublish(async (tx) => {
      const offering = await seedOffering(tx);
      const item = await seedItem(tx, offering.id, "ok");
      const opened = await publishPriceVersion(
        tx,
        priceInput({
          observationItemId: item.id,
          firstSeenAt: FIRST_SEEN,
          components: [component({ amount: "1" })],
        }),
      );
      const changed = await publishPriceVersion(
        tx,
        priceInput({
          observationItemId: item.id,
          firstSeenAt: NEXT_SEEN,
          previousLastSeenAt: LAST_SEEN,
          components: [
            component({ amount: "1" }),
            component({
              amount: "0.50",
              condition: { promptTokensAtMost: 100000 },
            }),
          ],
        }),
      );

      expect(await versionsFor(tx, offering.id)).toHaveLength(2);
      expect(await amountsFor(tx, changed.priceVersionId)).toEqual([
        { dimension: "input", amount: "1", condition: {} },
        {
          dimension: "input",
          amount: "0.50",
          condition: { promptTokensAtMost: 100000 },
        },
      ]);
      expect((await versionsFor(tx, offering.id))[0]?.id).toBe(opened.priceVersionId);
    });
  });

  it("throws when replacesVersionId is not this offering's open version", async () => {
    await withPublish(async (tx) => {
      const first = await seedOffering(tx);
      const second = await seedOffering(tx);
      const firstItem = await seedItem(tx, first.id, "ok");
      const secondItem = await seedItem(tx, second.id, "ok");
      const published = await publishPriceVersion(
        tx,
        priceInput({ observationItemId: firstItem.id, firstSeenAt: NEXT_SEEN }),
      );
      await expect(
        publishPriceVersion(
          tx,
          priceInput({
            observationItemId: secondItem.id,
            firstSeenAt: NEXT_SEEN,
            replacesVersionId: published.priceVersionId,
            retractedAt: RETRACTED,
            components: [component({ amount: "1" })],
          }),
        ),
      ).rejects.toThrow(/not the open price version/);
      expect(await versionsFor(tx, second.id)).toHaveLength(0);
      expect((await versionsFor(tx, first.id))[0]?.retractedAt).toBeNull();
    });
  });

  it("throws when a correction uses a different firstSeenAt", async () => {
    await withPublish(async (tx) => {
      const offering = await seedOffering(tx);
      const item = await seedItem(tx, offering.id, "ok");
      const wrong = await publishPriceVersion(
        tx,
        priceInput({ observationItemId: item.id, firstSeenAt: NEXT_SEEN }),
      );
      await expect(
        publishPriceVersion(
          tx,
          priceInput({
            observationItemId: item.id,
            firstSeenAt: FIRST_SEEN,
            replacesVersionId: wrong.priceVersionId,
            retractedAt: RETRACTED,
            components: [component({ amount: "1" })],
          }),
        ),
      ).rejects.toThrow(/firstSeenAt must match/);
      expect((await versionsFor(tx, offering.id))[0]?.retractedAt).toBeNull();
    });
  });

  it("throws when a stored condition is not a tier object", async () => {
    await withPublish(async (tx) => {
      const offering = await seedOffering(tx);
      const item = await seedItem(tx, offering.id, "ok");
      const opened = await publishPriceVersion(
        tx,
        priceInput({ observationItemId: item.id, firstSeenAt: FIRST_SEEN }),
      );
      // Plant a broken cell. The publisher only writes objects, so this is
      // the illegal row the next publish must refuse to compare.
      await tx
        .update(priceComponents)
        .set({ condition: [] })
        .where(eq(priceComponents.priceVersionId, opened.priceVersionId));

      await expect(
        publishPriceVersion(
          tx,
          priceInput({
            observationItemId: item.id,
            firstSeenAt: NEXT_SEEN,
            previousLastSeenAt: LAST_SEEN,
            components: [component({ amount: "1" })],
          }),
        ),
      ).rejects.toThrow(/stored condition/);
      expect(await versionsFor(tx, offering.id)).toHaveLength(1);
    });
  });

  it("throws when the offering already has two open versions", async () => {
    await withPublish(async (tx) => {
      const offering = await seedOffering(tx);
      const item = await seedItem(tx, offering.id, "ok");
      // The function cannot create this state. The rows are planted so the
      // test can prove it refuses to pick one. Step 14 should not treat this
      // setup as a second publisher.
      await tx.insert(priceVersions).values([
        { offeringId: offering.id, firstSeenAt: FIRST_SEEN },
        { offeringId: offering.id, firstSeenAt: NEXT_SEEN },
      ]);

      await expect(
        publishPriceVersion(
          tx,
          priceInput({
            observationItemId: item.id,
            firstSeenAt: RETRACTED,
            previousLastSeenAt: NEXT_SEEN,
            components: [component({ amount: "1" })],
          }),
        ),
      ).rejects.toThrow(/more than one open price version/);
      expect(await versionsFor(tx, offering.id)).toHaveLength(2);
    });
  });

  async function withPublish(run: (tx: PublishDb) => Promise<void>): Promise<void> {
    try {
      await db.transaction(async (tx) => {
        await run(tx);
        throw new RolledBack();
      });
    } catch (error) {
      if (error instanceof RolledBack) {
        return;
      }
      throw error;
    }
  }
});

/**
 * A real observation item id will not reach this. Identity starts at 1.
 */
const missingId = Number.MAX_SAFE_INTEGER;

class RolledBack extends Error {
  constructor() {
    super("publish test rolled back");
    this.name = "RolledBack";
  }
}

function untouchedDb(): PublishDb {
  // These checks must throw before any query. The stand-in has no real client.
  // A call that reaches transaction fails the test with a different message.
  return {
    transaction: () => {
      throw new Error("publishPriceVersion touched the database");
    },
  } as unknown as PublishDb;
}

function priceInput(overrides: Partial<PublishPriceVersionInput> = {}): PublishPriceVersionInput {
  return {
    observationItemId: 1,
    components: [component({})],
    firstSeenAt: NEXT_SEEN,
    ...overrides,
  };
}

function component(
  overrides: Partial<{
    dimension: string;
    unit: string;
    amount: string;
    condition: Record<string, unknown>;
  }>,
): PriceComponentInput {
  return {
    dimension: "input",
    unit: "usd_per_1m_tokens",
    amount: "1.25",
    ...overrides,
  } as PriceComponentInput;
}

function uniqueSlug(prefix: string): string {
  return `${prefix}-${randomUUID()}`;
}

async function seedOffering(tx: PublishDb) {
  const catalog = createCatalogRepository(tx);
  const lab = await catalog.insertLab({ name: "Anthropic", slug: uniqueSlug("lab") });
  const model = await catalog.insertModel({
    labId: lab.id,
    name: "Claude Haiku 4.5",
    slug: uniqueSlug("model"),
  });
  return catalog.insertOffering({ modelId: model.id, platform: "anthropic" });
}

async function seedItem(
  tx: PublishDb,
  offeringId: number,
  reviewStatus?: "ok" | "flagged" | "confirmed" | "rejected",
) {
  const sourceRows = await tx.insert(sources).values({
    url: `https://example.test/pricing/${randomUUID()}`,
    type: "official",
  }).returning();
  const source = requireInsertedRow(sourceRows, "insert source");
  const observationRows = await tx
    .insert(observations)
    .values({
      sourceId: source.id,
      fetchedAt: NEXT_SEEN,
      contentHash: "test-content",
      rawContent: "test page",
      rawContentHash: "test-raw",
      parsedData: {},
    })
    .returning();
  const observation = requireInsertedRow(observationRows, "insert observation");
  const itemRows = await tx
    .insert(observationItems)
    .values({
      observationId: observation.id,
      offeringId,
      ...(reviewStatus === undefined ? {} : { reviewStatus }),
    })
    .returning();
  return requireInsertedRow(itemRows, "insert observation item");
}

async function versionsFor(tx: PublishDb, offeringId: number) {
  return tx
    .select()
    .from(priceVersions)
    .where(eq(priceVersions.offeringId, offeringId))
    .orderBy(priceVersions.id);
}

async function amountsFor(tx: PublishDb, priceVersionId: number) {
  const rows = await tx
    .select()
    .from(priceComponents)
    .where(eq(priceComponents.priceVersionId, priceVersionId))
    .orderBy(priceComponents.id);
  return rows.map((row) => ({
    dimension: row.dimension,
    amount: row.amount,
    condition: row.condition,
  }));
}
