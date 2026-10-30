import { and, eq, isNull } from "drizzle-orm";
import type { ExtractTablesWithRelations } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import type { PostgresJsDatabase, PostgresJsQueryResultHKT } from "drizzle-orm/postgres-js";
import { pricePrecisionLabel, type PricePrecision } from "@/core/pricing/precision";
import type { Condition } from "@/core/pricing/shape";
import * as schema from "@/server/db/schema";
import { observationItems, priceComponents, priceVersions } from "@/server/db/schema";

/**
 * The only function that may insert price_versions and price_components.
 *
 * A caller passes an observation item that is already ok or confirmed, plus
 * the amounts and the dates. This file checks the item, then writes. It does
 * not read parsed_data or fetch_log. Those lookups belong to the later pipeline.
 *
 * A normal change closes the open period, then opens a new one. A correction
 * marks the open row retracted and adds a fix that points at it. The two
 * paths cannot be combined. Both writes share one transaction, so a failure
 * keeps the previous current price.
 *
 * price_version_evidence is not written here. That table does not exist yet.
 */

type Schema = typeof schema;

/**
 * The normal client, or a transaction opened by a caller.
 * A transaction is a different class with the same insert and select methods.
 */
export type PublishDb =
  | PostgresJsDatabase<Schema>
  | PgTransaction<PostgresJsQueryResultHKT, Schema, ExtractTablesWithRelations<Schema>>;

const DIMENSIONS = [
  "input",
  "output",
  "cache_read",
  "cache_write_5m",
  "cache_write_1h",
  "cache_write",
] as const;

type Dimension = (typeof DIMENSIONS)[number];

const CONDITION_KEYS = [
  "promptTokensOver",
  "promptTokensAtMost",
  "promptTokensUnder",
  "promptTokensAtLeast",
] as const;

const DECIMAL_AMOUNT = /^(?:0|[1-9]\d*)(?:\.\d+)?$/;
const CALENDAR_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export type PriceComponentInput = {
  dimension: Dimension;
  unit: "usd_per_1m_tokens";
  amount: string;
  condition?: Condition;
};

export type PublishPriceVersionInput = {
  observationItemId: number;
  components: PriceComponentInput[];
  firstSeenAt: Date;
  announcedOn?: string | null;
  previousLastSeenAt?: Date;
  replacesVersionId?: number;
  retractedAt?: Date;
};

type StoredComponent = {
  dimension: Dimension;
  unit: "usd_per_1m_tokens";
  amount: string;
  condition: Record<string, number>;
};

type PreparedPublish = {
  observationItemId: number;
  components: StoredComponent[];
  firstSeenAt: Date;
  announcedOn: string | null;
  previousLastSeenAt?: Date;
  replacesVersionId?: number;
  retractedAt?: Date;
};

type OpenVersion = {
  id: number;
  firstSeenAt: Date;
};

export async function publishPriceVersion(
  db: PublishDb,
  input: PublishPriceVersionInput,
): Promise<{ priceVersionId: number; precision: PricePrecision }> {
  const prepared = preparePublishInput(input);

  return db.transaction(async (tx) => {
    const item = await loadItem(tx, prepared.observationItemId);
    if (item === undefined) {
      throw new Error(`observation item ${prepared.observationItemId} does not exist`);
    }
    if (item.reviewStatus !== "ok" && item.reviewStatus !== "confirmed") {
      throw new Error(
        `observation item ${item.id} has review_status ${item.reviewStatus}; only ok and confirmed can publish`,
      );
    }

    const openVersions = await findOpenVersions(tx, item.offeringId);
    if (openVersions.length > 1) {
      throw new Error(`offering ${item.offeringId} has more than one open price version`);
    }
    const open = openVersions[0];

    if (prepared.replacesVersionId !== undefined) {
      return publishCorrection(tx, item.offeringId, open, prepared);
    }
    return publishPeriod(tx, item.offeringId, open, prepared);
  });
}

function preparePublishInput(input: PublishPriceVersionInput): PreparedPublish {
  if (input.components.length === 0) {
    throw new Error("a price version needs at least one component");
  }

  const components = input.components.map(readComponent);
  const seen = new Set<string>();
  for (const component of components) {
    const key = componentIdentity(component);
    if (seen.has(key)) {
      throw new Error("two components share the same dimension and condition");
    }
    seen.add(key);
  }

  if (!isRealDate(input.firstSeenAt)) {
    throw new Error("firstSeenAt must be a valid date");
  }

  const announcedOn = input.announcedOn ?? null;
  if (announcedOn !== null) {
    assertCalendarDate(announcedOn);
  }

  if (input.replacesVersionId !== undefined && input.previousLastSeenAt !== undefined) {
    throw new Error("replacesVersionId and previousLastSeenAt cannot both be set");
  }
  if (input.replacesVersionId !== undefined && input.retractedAt === undefined) {
    throw new Error("retractedAt is required when replacesVersionId is set");
  }
  if (input.retractedAt !== undefined && input.replacesVersionId === undefined) {
    throw new Error("retractedAt cannot be set unless replacesVersionId is set");
  }
  if (input.previousLastSeenAt !== undefined && !isRealDate(input.previousLastSeenAt)) {
    throw new Error("previousLastSeenAt must be a valid date");
  }
  if (input.retractedAt !== undefined && !isRealDate(input.retractedAt)) {
    throw new Error("retractedAt must be a valid date");
  }
  if (
    input.previousLastSeenAt !== undefined &&
    input.previousLastSeenAt.getTime() >= input.firstSeenAt.getTime()
  ) {
    throw new Error("previousLastSeenAt must be before firstSeenAt");
  }

  return {
    observationItemId: input.observationItemId,
    components,
    firstSeenAt: input.firstSeenAt,
    announcedOn,
    previousLastSeenAt: input.previousLastSeenAt,
    replacesVersionId: input.replacesVersionId,
    retractedAt: input.retractedAt,
  };
}

function readComponent(value: PriceComponentInput): StoredComponent {
  const raw: {
    dimension: unknown;
    unit: unknown;
    amount: unknown;
    condition?: unknown;
  } = value;

  if (!isDimension(raw.dimension)) {
    throw new Error(`dimension ${String(raw.dimension)} is not a known price dimension`);
  }
  if (raw.unit !== "usd_per_1m_tokens") {
    throw new Error("unit must be usd_per_1m_tokens");
  }
  if (typeof raw.amount !== "string" || !DECIMAL_AMOUNT.test(raw.amount)) {
    throw new Error("amount must be a non-negative decimal string");
  }

  return {
    dimension: raw.dimension,
    unit: "usd_per_1m_tokens",
    amount: raw.amount,
    condition: readCondition(raw.condition),
  };
}

function readCondition(value: unknown): Record<string, number> {
  if (value === undefined) {
    return {};
  }
  if (!isRecord(value)) {
    throw new Error("condition is not a known tier");
  }

  const condition: Record<string, number> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (!isConditionKey(key) || !isPositiveInteger(entry)) {
      throw new Error("condition is not a known tier");
    }
    condition[key] = entry;
  }
  return condition;
}

async function publishPeriod(
  tx: PublishDb,
  offeringId: number,
  open: OpenVersion | undefined,
  prepared: PreparedPublish,
): Promise<{ priceVersionId: number; precision: PricePrecision }> {
  if (open === undefined) {
    if (prepared.previousLastSeenAt !== undefined) {
      throw new Error(
        "previousLastSeenAt was set, and this offering has no open price version to close",
      );
    }
    return insertVersion(tx, offeringId, prepared, null);
  }

  if (prepared.previousLastSeenAt === undefined) {
    throw new Error("previousLastSeenAt is required when an open price version exists");
  }
  if (prepared.previousLastSeenAt.getTime() < open.firstSeenAt.getTime()) {
    throw new Error("previousLastSeenAt is before the open version started");
  }

  const existing = await componentsFor(tx, open.id);
  if (samePrice(prepared.components, existing)) {
    throw new Error("this price matches the open version, so it is not a new period");
  }

  await tx
    .update(priceVersions)
    .set({ lastSeenAt: prepared.previousLastSeenAt })
    .where(eq(priceVersions.id, open.id));

  return insertVersion(tx, offeringId, prepared, null);
}

async function publishCorrection(
  tx: PublishDb,
  offeringId: number,
  open: OpenVersion | undefined,
  prepared: PreparedPublish,
): Promise<{ priceVersionId: number; precision: PricePrecision }> {
  if (open === undefined || open.id !== prepared.replacesVersionId) {
    throw new Error(
      `replacesVersionId ${String(prepared.replacesVersionId)} is not the open price version for this offering`,
    );
  }
  if (open.firstSeenAt.getTime() !== prepared.firstSeenAt.getTime()) {
    throw new Error("firstSeenAt must match the version being replaced");
  }
  if (prepared.retractedAt === undefined) {
    throw new Error("retractedAt is required when replacesVersionId is set");
  }

  await tx
    .update(priceVersions)
    .set({ retractedAt: prepared.retractedAt })
    .where(eq(priceVersions.id, open.id));

  return insertVersion(tx, offeringId, prepared, open.id);
}

async function insertVersion(
  tx: PublishDb,
  offeringId: number,
  prepared: PreparedPublish,
  replacesVersionId: number | null,
): Promise<{ priceVersionId: number; precision: PricePrecision }> {
  const rows = await tx
    .insert(priceVersions)
    .values({
      offeringId,
      firstSeenAt: prepared.firstSeenAt,
      announcedOn: prepared.announcedOn,
      replacesVersionId,
    })
    .returning();
  const version = rows[0];
  if (version === undefined) {
    throw new Error("insert price version returned no row");
  }

  await tx.insert(priceComponents).values(
    prepared.components.map((component) => ({
      priceVersionId: version.id,
      dimension: component.dimension,
      unit: component.unit,
      amount: component.amount,
      condition: component.condition,
    })),
  );

  return {
    priceVersionId: version.id,
    precision: pricePrecisionLabel({
      firstSeenAt: prepared.firstSeenAt,
      announcedOn: prepared.announcedOn,
    }),
  };
}

async function loadItem(tx: PublishDb, observationItemId: number) {
  const rows = await tx
    .select()
    .from(observationItems)
    .where(eq(observationItems.id, observationItemId))
    .limit(1);
  return rows[0];
}

async function findOpenVersions(tx: PublishDb, offeringId: number): Promise<OpenVersion[]> {
  const rows = await tx
    .select({
      id: priceVersions.id,
      firstSeenAt: priceVersions.firstSeenAt,
    })
    .from(priceVersions)
    .where(
      and(
        eq(priceVersions.offeringId, offeringId),
        isNull(priceVersions.lastSeenAt),
        isNull(priceVersions.retractedAt),
      ),
    );
  return rows;
}

async function componentsFor(tx: PublishDb, priceVersionId: number) {
  return tx
    .select({
      dimension: priceComponents.dimension,
      unit: priceComponents.unit,
      amount: priceComponents.amount,
      condition: priceComponents.condition,
    })
    .from(priceComponents)
    .where(eq(priceComponents.priceVersionId, priceVersionId));
}

function samePrice(
  next: StoredComponent[],
  current: {
    dimension: string;
    unit: string;
    amount: string;
    condition: unknown;
  }[],
): boolean {
  if (next.length !== current.length) {
    return false;
  }
  const keys = new Set(next.map((component) => priceKey(component)));
  return current.every((component) =>
    keys.has(
      priceKey({
        dimension: component.dimension,
        unit: component.unit,
        amount: component.amount,
        condition: readStoredCondition(component.condition),
      }),
    ),
  );
}

function componentIdentity(component: {
  dimension: string;
  condition: Record<string, number>;
}): string {
  return JSON.stringify([component.dimension, conditionEntries(component.condition)]);
}

function priceKey(component: {
  dimension: string;
  unit: string;
  amount: string;
  condition: Record<string, number>;
}): string {
  return JSON.stringify([
    component.dimension,
    component.unit,
    canonicalAmount(component.amount),
    conditionEntries(component.condition),
  ]);
}

function conditionEntries(condition: Record<string, number>): [string, number][] {
  return Object.entries(condition).sort(([left], [right]) => left.localeCompare(right));
}

/**
 * "1", "1.0", and "1.00" are the same money. A new spelling is not a new price.
 * The stored text stays what the caller sent. Postgres numeric may also drop
 * trailing zeros when the row is read back.
 */
function canonicalAmount(amount: string): string {
  const [whole, fraction = ""] = amount.split(".");
  const trimmedFraction = fraction.replace(/0+$/, "");
  const trimmedWhole = whole.replace(/^0+(?=\d)/, "");
  if (trimmedFraction.length === 0) {
    return trimmedWhole;
  }
  return `${trimmedWhole}.${trimmedFraction}`;
}

function readStoredCondition(value: unknown): Record<string, number> {
  if (!isRecord(value)) {
    throw new Error("stored condition is not an object");
  }
  const condition: Record<string, number> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry !== "number") {
      throw new Error("stored condition is not a known tier");
    }
    condition[key] = entry;
  }
  return condition;
}

function assertCalendarDate(value: string): void {
  const match = CALENDAR_DATE.exec(value);
  if (match === null) {
    throw new Error("announcedOn must be a YYYY-MM-DD date");
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new Error("announcedOn must be a YYYY-MM-DD date");
  }
}

function isRealDate(value: Date): boolean {
  return value instanceof Date && !Number.isNaN(value.getTime());
}

function isDimension(value: unknown): value is Dimension {
  return typeof value === "string" && DIMENSIONS.some((dimension) => dimension === value);
}

function isConditionKey(value: string): value is (typeof CONDITION_KEYS)[number] {
  return CONDITION_KEYS.some((key) => key === value);
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
