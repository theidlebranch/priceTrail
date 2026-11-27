import { and, desc, eq, type ExtractTablesWithRelations } from "drizzle-orm";
import { alias, type PgTransaction } from "drizzle-orm/pg-core";
import type { PostgresJsDatabase, PostgresJsQueryResultHKT } from "drizzle-orm/postgres-js";
import {
  checkedFollowAccountId,
  checkedFollowTarget,
  FollowRefusal,
  type FollowTarget,
} from "@/core/follows/follow";
import { requireInsertedRow } from "@/server/db/repositories/catalog";
import * as schema from "@/server/db/schema";
import { follows, labs, models } from "@/server/db/schema";

/**
 * Follows for one signed-in account.
 *
 * followTarget inserts one row. A second follow of the same target
 * returns the row that is already there and does not move followed_at.
 * unfollowTarget deletes that row. A missing row changes nothing.
 * listFollows only selects. It does not select a price. This file does
 * not call publishPriceVersion().
 */

type Schema = typeof schema;

export type FollowDb =
  | PostgresJsDatabase<Schema>
  | PgTransaction<PostgresJsQueryResultHKT, Schema, ExtractTablesWithRelations<Schema>>;

export type FollowTargetInput = FollowTarget & {
  accountId: string;
  followedAt: Date;
};

export type FollowResult = {
  id: number;
  followedAt: Date;
  alreadyFollowed: boolean;
};

export type ListedFollow = {
  id: number;
  followedAt: Date;
} & (
  | {
      kind: "model";
      name: string;
      modelSlug: string;
      labName: string;
      labSlug: string;
      retired: boolean;
    }
  | {
      kind: "lab";
      name: string;
      labSlug: string;
    }
);

const modelLab = alias(labs, "model_lab");

export async function followTarget(db: FollowDb, input: FollowTargetInput): Promise<FollowResult> {
  const accountId = checkedFollowAccountId(input.accountId);
  assertRealDate(input.followedAt, "followedAt");
  const target = checkedFollowTarget(input);

  try {
    return await db.transaction(async (tx) => {
      const existing = await findFollowRow(tx, accountId, target);
      if (existing !== null) {
        return { id: existing.id, followedAt: existing.followedAt, alreadyFollowed: true };
      }

      const rows = await tx
        .insert(follows)
        .values({
          accountId,
          kind: target.kind,
          modelId: target.kind === "model" ? target.modelId : null,
          labId: target.kind === "lab" ? target.labId : null,
          followedAt: input.followedAt,
        })
        .returning({ id: follows.id, followedAt: follows.followedAt });
      const row = requireInsertedRow(rows, "followTarget");
      return { id: row.id, followedAt: row.followedAt, alreadyFollowed: false };
    });
  } catch (error) {
    if (sqlState(error) === "23505") {
      const existing = await findFollowRow(db, accountId, target);
      if (existing !== null) {
        return { id: existing.id, followedAt: existing.followedAt, alreadyFollowed: true };
      }
    }
    if (sqlState(error) === "23503" || sqlState(error) === "23505") {
      throw new FollowRefusal(missingTargetMessage(target));
    }
    throw error;
  }
}

export async function unfollowTarget(
  db: FollowDb,
  input: FollowTarget & { accountId: string },
): Promise<{ removed: boolean }> {
  const accountId = checkedFollowAccountId(input.accountId);
  const target = checkedFollowTarget(input);
  const rows = await db
    .delete(follows)
    .where(followWhere(accountId, target))
    .returning({ id: follows.id });
  return { removed: rows.length > 0 };
}

export async function listFollows(db: FollowDb, accountId: string): Promise<ListedFollow[]> {
  const id = checkedFollowAccountId(accountId);
  const rows = await db
    .select({
      id: follows.id,
      kind: follows.kind,
      followedAt: follows.followedAt,
      modelName: models.name,
      modelSlug: models.slug,
      deprecatedAt: models.deprecatedAt,
      modelLabName: modelLab.name,
      modelLabSlug: modelLab.slug,
      labName: labs.name,
      labSlug: labs.slug,
    })
    .from(follows)
    .leftJoin(models, eq(follows.modelId, models.id))
    .leftJoin(modelLab, eq(models.labId, modelLab.id))
    .leftJoin(labs, eq(follows.labId, labs.id))
    .where(eq(follows.accountId, id))
    .orderBy(desc(follows.followedAt), desc(follows.id));

  return rows.map((row) => {
    if (row.kind === "model") {
      if (
        row.modelName === null ||
        row.modelSlug === null ||
        row.modelLabName === null ||
        row.modelLabSlug === null
      ) {
        throw new Error("follow is missing its model");
      }
      return {
        id: row.id,
        followedAt: row.followedAt,
        kind: "model",
        name: row.modelName,
        modelSlug: row.modelSlug,
        labName: row.modelLabName,
        labSlug: row.modelLabSlug,
        retired: row.deprecatedAt !== null,
      };
    }
    if (row.labName === null || row.labSlug === null) {
      throw new Error("follow is missing its lab");
    }
    return {
      id: row.id,
      followedAt: row.followedAt,
      kind: "lab",
      name: row.labName,
      labSlug: row.labSlug,
    };
  });
}

async function findFollowRow(
  db: FollowDb,
  accountId: string,
  target: FollowTarget,
): Promise<{ id: number; followedAt: Date } | null> {
  const rows = await db
    .select({ id: follows.id, followedAt: follows.followedAt })
    .from(follows)
    .where(followWhere(accountId, target))
    .for("update")
    .limit(1);
  return rows[0] ?? null;
}

function followWhere(accountId: string, target: FollowTarget) {
  if (target.kind === "model") {
    return and(
      eq(follows.accountId, accountId),
      eq(follows.kind, "model"),
      eq(follows.modelId, target.modelId),
    );
  }
  return and(eq(follows.accountId, accountId), eq(follows.kind, "lab"), eq(follows.labId, target.labId));
}

function missingTargetMessage(target: FollowTarget): string {
  return target.kind === "model" ? "that model is not tracked" : "that lab is not tracked";
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
