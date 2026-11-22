import { and, asc, desc, eq, sql, type ExtractTablesWithRelations } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import type { PostgresJsDatabase, PostgresJsQueryResultHKT } from "drizzle-orm/postgres-js";
import {
  checkedAccountId,
  checkedLabName,
  checkedRequestId,
  checkedReviewNote,
  LabRequestRefusal,
  labNameKey,
  matchesTrackedLab,
} from "@/core/labs/suggest-lab";
import { requireInsertedRow } from "@/server/db/repositories/catalog";
import * as schema from "@/server/db/schema";
import { labs, models, requests } from "@/server/db/schema";

/**
 * Labs we already track, and suggestions for labs we do not.
 *
 * listLabs only selects. suggestLab inserts one pending request.
 * decideLabRequest stamps that row accepted or declined. Accepting
 * does not insert a lab, a source, or a schedule. This file does not
 * call publishPriceVersion().
 */

type Schema = typeof schema;

export type LabRequestDb =
  | PostgresJsDatabase<Schema>
  | PgTransaction<PostgresJsQueryResultHKT, Schema, ExtractTablesWithRelations<Schema>>;

export type ListedLab = {
  name: string;
  slug: string;
  modelCount: number;
};

export type StoredLabRequest = {
  id: number;
  labName: string;
  suggestedBy: string;
  suggestedAt: Date;
  status: "pending" | "accepted" | "declined";
  reviewedBy: string | null;
  reviewedAt: Date | null;
  reviewNote: string | null;
};

const requestColumns = {
  id: requests.id,
  labName: requests.labName,
  suggestedBy: requests.suggestedBy,
  suggestedAt: requests.suggestedAt,
  status: requests.status,
  reviewedBy: requests.reviewedBy,
  reviewedAt: requests.reviewedAt,
  reviewNote: requests.reviewNote,
};

export async function listLabs(db: LabRequestDb): Promise<ListedLab[]> {
  const rows = await db
    .select({
      name: labs.name,
      slug: labs.slug,
      modelCount: sql<number | string>`count(${models.id})::int`,
    })
    .from(labs)
    .leftJoin(models, eq(models.labId, labs.id))
    .groupBy(labs.id)
    .orderBy(asc(labs.name), asc(labs.id));

  return rows.map((row) => ({
    name: row.name,
    slug: row.slug,
    modelCount: wholeCount(row.modelCount),
  }));
}

export async function suggestLab(
  db: LabRequestDb,
  input: { labName: string; suggestedBy: string; suggestedAt: Date },
): Promise<{ id: number }> {
  const labName = checkedLabName(input.labName);
  const suggestedBy = checkedAccountId(input.suggestedBy);
  assertRealDate(input.suggestedAt, "suggestedAt");
  const key = labNameKey(labName);

  try {
    return await db.transaction(async (tx) => {
      const tracked = await tx.select({ name: labs.name, slug: labs.slug }).from(labs);
      if (matchesTrackedLab(labName, tracked)) {
        throw new LabRequestRefusal("that lab is already tracked");
      }

      const pending = await tx
        .select({ id: requests.id })
        .from(requests)
        .where(
          and(eq(requests.kind, "lab"), eq(requests.status, "pending"), eq(requests.labNameKey, key)),
        )
        .for("update");
      if (pending.length > 0) {
        throw new LabRequestRefusal("that lab is already suggested");
      }

      const rows = await tx
        .insert(requests)
        .values({
          kind: "lab",
          labName,
          labNameKey: key,
          suggestedBy,
          suggestedAt: input.suggestedAt,
        })
        .returning({ id: requests.id });
      return requireInsertedRow(rows, "suggestLab");
    });
  } catch (error) {
    if (sqlState(error) === "23505") {
      throw new LabRequestRefusal("that lab is already suggested");
    }
    throw error;
  }
}

export async function listPendingLabRequests(db: LabRequestDb): Promise<StoredLabRequest[]> {
  return db
    .select(requestColumns)
    .from(requests)
    .where(and(eq(requests.kind, "lab"), eq(requests.status, "pending")))
    .orderBy(asc(requests.suggestedAt), asc(requests.id));
}

export async function listLabRequestsForAccount(
  db: LabRequestDb,
  suggestedBy: string,
): Promise<StoredLabRequest[]> {
  const accountId = checkedAccountId(suggestedBy);
  return db
    .select(requestColumns)
    .from(requests)
    .where(and(eq(requests.kind, "lab"), eq(requests.suggestedBy, accountId)))
    .orderBy(desc(requests.suggestedAt), desc(requests.id));
}

export async function decideLabRequest(
  db: LabRequestDb,
  input: {
    requestId: number;
    decision: "accept" | "decline";
    note: string;
    reviewedBy: string;
    reviewedAt: Date;
  },
): Promise<void> {
  const requestId = checkedRequestId(input.requestId);
  const note = checkedReviewNote(input.note);
  const reviewedBy = checkedAccountId(input.reviewedBy);
  assertRealDate(input.reviewedAt, "reviewedAt");

  await db.transaction(async (tx) => {
    const rows = await tx
      .select({ id: requests.id, kind: requests.kind, status: requests.status })
      .from(requests)
      .where(eq(requests.id, requestId))
      .for("update");
    const row = rows[0];
    if (row === undefined) {
      throw new LabRequestRefusal("request was not found");
    }
    if (row.kind !== "lab") {
      throw new LabRequestRefusal("request is not a lab suggestion");
    }
    if (row.status !== "pending") {
      throw new LabRequestRefusal("request is not waiting");
    }

    await tx
      .update(requests)
      .set({
        status: input.decision === "accept" ? "accepted" : "declined",
        reviewedBy,
        reviewedAt: input.reviewedAt,
        reviewNote: note,
      })
      .where(and(eq(requests.id, requestId), eq(requests.status, "pending")));
  });
}

function wholeCount(value: number | string): number {
  const count = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(count) || count < 0) {
    throw new Error("model count is not a whole number");
  }
  return count;
}

function assertRealDate(value: Date, label: string): void {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new Error(`${label} is not a real date`);
  }
}

function sqlState(error: unknown): string | undefined {
  if (error && typeof error === "object" && "code" in error && typeof error.code === "string") {
    return error.code;
  }
  if (error instanceof Error && "cause" in error) {
    return sqlState(error.cause);
  }
  return undefined;
}
