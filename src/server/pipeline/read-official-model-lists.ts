import { and, desc, eq, sql } from "drizzle-orm";
import {
  classifyOfficialList,
  parseAnthropicModelList,
  parseGoogleModelList,
  parseOpenAiModelList,
  type OfficialLab,
  type OfficialModel,
} from "@/core/models/official-list";
import { redactSecrets } from "@/server/db/seed";
import { candidateModels, labs, modelLimits, models, sources, witnessReads } from "@/server/db/schema";
import type { SignalDb } from "@/server/pipeline/read-litellm-signal";
import type { FetchLike } from "@/server/sources/provider-source";
import {
  ANTHROPIC_MODELS_URL,
  blankKey,
  downloadOfficialModelList,
  GOOGLE_MODELS_URL,
  OfficialListReadError,
  OPENAI_MODELS_URL,
  type OfficialListLab,
} from "@/server/sources/official-model-list";

/**
 * Read the OpenAI, Anthropic, and Google model lists.
 *
 * Each lab is its own transaction. A failed download or a bad parse
 * stores only that lab's attempt and leaves its old token limits and
 * cards alone. A missing key skips that lab and writes nothing. The
 * first success remembers ids. A later read can add a card. Token
 * limits update on every success, including the first. This file does
 * not call publishPriceVersion().
 */

const LABS = ["openai", "anthropic", "google"] as const;

const LIST_URL: Record<OfficialListLab, string> = {
  openai: OPENAI_MODELS_URL,
  anthropic: ANTHROPIC_MODELS_URL,
  google: GOOGLE_MODELS_URL,
};

const LIST_LABEL: Record<OfficialListLab, string> = {
  openai: "OpenAI model list",
  anthropic: "Anthropic model list",
  google: "Google model list",
};

export type OfficialModelListKeys = {
  openai: string | null;
  anthropic: string | null;
  google: string | null;
};

export type OfficialModelListLabResult =
  | { lab: OfficialListLab; kind: "skipped"; reason: "missing key" }
  | {
      lab: OfficialListLab;
      kind: "ok";
      isBaseline: boolean;
      newModelCount: number;
      retirementCount: number;
      limitCount: number;
    }
  | { lab: OfficialListLab; kind: "fetch_error" | "parse_error"; note: string };

export type OfficialModelListResult = {
  labs: OfficialModelListLabResult[];
};

export function readOfficialModelListKeys(env: NodeJS.Dict<string>): OfficialModelListKeys {
  return {
    openai: blankKey(env.OPEN_AI_AUTH_KEY),
    anthropic: blankKey(env.ANTHROPIC_AUTH_KEY),
    google: blankKey(env.AI_STUDIO_GOOGLE_AUTH_KEY),
  };
}

export async function readOfficialModelLists(
  db: SignalDb,
  input: { fetchedAt: Date; fetchImpl: FetchLike; keys: OfficialModelListKeys },
): Promise<OfficialModelListResult> {
  if (!(input.fetchedAt instanceof Date) || Number.isNaN(input.fetchedAt.getTime())) {
    throw new Error("fetchedAt is not a real date");
  }
  const secrets = secretValues(input.keys);
  const labs: OfficialModelListLabResult[] = [];
  for (const lab of LABS) {
    labs.push(await readOneLab(db, lab, input, secrets));
  }
  return { labs };
}

async function readOneLab(
  db: SignalDb,
  lab: OfficialListLab,
  input: { fetchedAt: Date; fetchImpl: FetchLike; keys: OfficialModelListKeys },
  secrets: readonly string[],
): Promise<OfficialModelListLabResult> {
  const key = input.keys[lab];
  if (key === null) {
    return { lab, kind: "skipped", reason: "missing key" };
  }

  let payload: unknown;
  try {
    payload = await downloadOfficialModelList(lab, key, input.fetchImpl);
  } catch (error) {
    if (error instanceof OfficialListReadError) {
      return recordFailure(db, lab, input.fetchedAt, error.outcome, redactSecrets(error.message, secrets));
    }
    throw error;
  }

  let parsed: OfficialModel[];
  try {
    parsed = parseLab(lab, payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : `${LIST_LABEL[lab]} parse failed`;
    return recordFailure(db, lab, input.fetchedAt, "parse_error", redactSecrets(message, secrets));
  }

  return db.transaction(async (tx) => {
    const source = await lockListSource(tx, lab);
    await assertReadOrder(tx, source.id, input.fetchedAt);
    const tracked = await loadTracked(tx, lab);
    const previous = await latestSuccessfulRead(tx, source.id);
    const existing = await loadCandidateSlugs(tx, source.id);
    const labId = await loadLabId(tx, lab);
    let change;
    try {
      change = classifyOfficialList({
        lab,
        models: parsed,
        trackedSlugs: new Set(tracked.keys()),
        previousSeenSlugs: previous?.seenSlugs ?? null,
        previousRetiringSlugs: previous?.retiringSlugs ?? [],
        existingCandidateSlugs: existing,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : `${LIST_LABEL[lab]} parse failed`;
      const note = redactSecrets(message, secrets);
      await tx.insert(witnessReads).values({
        sourceId: source.id,
        fetchedAt: input.fetchedAt,
        outcome: "parse_error",
        note,
        seenSlugs: [],
        retiringSlugs: [],
        isBaseline: false,
      });
      return { lab, kind: "parse_error" as const, note };
    }

    await tx.insert(witnessReads).values({
      sourceId: source.id,
      fetchedAt: input.fetchedAt,
      outcome: "ok",
      note: "",
      seenSlugs: change.seenSlugs,
      retiringSlugs: change.retiringSlugs,
      isBaseline: change.isBaseline,
      agreedCount: 0,
      notComparedCount: 0,
    });

    if (change.limits.length > 0) {
      await tx
        .insert(modelLimits)
        .values(
          change.limits.map((limit) => {
            const modelId = tracked.get(limit.slug);
            if (modelId === undefined) {
              throw new Error(`tracked model ${limit.slug} disappeared during the read`);
            }
            return {
              modelId,
              sourceId: source.id,
              maxInputTokens: limit.maxInputTokens,
              maxOutputTokens: limit.maxOutputTokens,
              observedAt: input.fetchedAt,
            };
          }),
        )
        .onConflictDoUpdate({
          target: modelLimits.modelId,
          set: {
            sourceId: sql`excluded.source_id`,
            maxInputTokens: sql`excluded.max_input_tokens`,
            maxOutputTokens: sql`excluded.max_output_tokens`,
            observedAt: sql`excluded.observed_at`,
          },
        });
    }

    const cards = [
      ...change.newNames.map((row) => ({
        labId,
        rawName: row.rawName,
        rawSlug: row.slug,
        sourceId: source.id,
        firstSeenAt: input.fetchedAt,
        kind: "new_name" as const,
        hint: null,
      })),
      ...change.retirements.map((row) => ({
        labId,
        rawName: row.rawName,
        rawSlug: row.slug,
        sourceId: source.id,
        firstSeenAt: input.fetchedAt,
        kind: "retirement" as const,
        hint: row.hint,
      })),
    ];
    if (cards.length > 0) {
      await tx.insert(candidateModels).values(cards);
    }

    return {
      lab,
      kind: "ok" as const,
      isBaseline: change.isBaseline,
      newModelCount: change.newNames.length,
      retirementCount: change.retirements.length,
      limitCount: change.limits.length,
    };
  });
}

function parseLab(lab: OfficialLab, payload: unknown): OfficialModel[] {
  if (lab === "openai") {
    return parseOpenAiModelList(payload);
  }
  if (lab === "anthropic") {
    return parseAnthropicModelList(payload);
  }
  return parseGoogleModelList(payload);
}

async function recordFailure(
  db: SignalDb,
  lab: OfficialListLab,
  fetchedAt: Date,
  outcome: "fetch_error" | "parse_error",
  note: string,
): Promise<OfficialModelListLabResult> {
  const sentence = note.trim() === "" ? `${LIST_LABEL[lab]} read failed` : note.trim();
  await db.transaction(async (tx) => {
    const source = await lockListSource(tx, lab);
    await assertReadOrder(tx, source.id, fetchedAt);
    await tx.insert(witnessReads).values({
      sourceId: source.id,
      fetchedAt,
      outcome,
      note: sentence,
      seenSlugs: [],
      retiringSlugs: [],
      isBaseline: false,
    });
  });
  return { lab, kind: outcome, note: sentence };
}

async function lockListSource(tx: SignalDb, lab: OfficialListLab): Promise<{ id: number }> {
  const url = LIST_URL[lab];
  await tx.insert(sources).values({ url, type: "platform_api" }).onConflictDoNothing();
  const rows = await tx
    .select({ id: sources.id, type: sources.type })
    .from(sources)
    .where(eq(sources.url, url))
    .for("update");
  const source = rows[0];
  if (source === undefined) {
    throw new Error(`${LIST_LABEL[lab]} source row was not stored`);
  }
  if (source.type !== "platform_api") {
    throw new Error(`${LIST_LABEL[lab]} source type is ${source.type}`);
  }
  return { id: source.id };
}

async function assertReadOrder(tx: SignalDb, sourceId: number, fetchedAt: Date): Promise<void> {
  const rows = await tx
    .select({ fetchedAt: witnessReads.fetchedAt })
    .from(witnessReads)
    .where(eq(witnessReads.sourceId, sourceId))
    .orderBy(desc(witnessReads.fetchedAt), desc(witnessReads.id))
    .limit(1);
  const latest = rows[0]?.fetchedAt;
  if (latest !== undefined && fetchedAt.getTime() < latest.getTime()) {
    throw new Error("fetchedAt is earlier than the latest witness read");
  }
}

async function latestSuccessfulRead(
  tx: SignalDb,
  sourceId: number,
): Promise<{ seenSlugs: string[]; retiringSlugs: string[] } | null> {
  const rows = await tx
    .select({ seenSlugs: witnessReads.seenSlugs, retiringSlugs: witnessReads.retiringSlugs })
    .from(witnessReads)
    .where(and(eq(witnessReads.sourceId, sourceId), eq(witnessReads.outcome, "ok")))
    .orderBy(desc(witnessReads.fetchedAt), desc(witnessReads.id))
    .limit(1);
  const row = rows[0];
  if (row === undefined) {
    return null;
  }
  return {
    seenSlugs: readSlugList(row.seenSlugs, "seen_slugs"),
    retiringSlugs: readSlugList(row.retiringSlugs, "retiring_slugs"),
  };
}

function readSlugList(value: unknown, column: string): string[] {
  if (!Array.isArray(value) || value.some((slug) => typeof slug !== "string")) {
    throw new Error(`witness ${column} is not a list of strings`);
  }
  return value;
}

async function loadCandidateSlugs(tx: SignalDb, sourceId: number): Promise<Set<string>> {
  const rows = await tx
    .select({ rawSlug: candidateModels.rawSlug })
    .from(candidateModels)
    .where(eq(candidateModels.sourceId, sourceId));
  return new Set(rows.map((row) => row.rawSlug));
}

async function loadLabId(tx: SignalDb, lab: OfficialListLab): Promise<number> {
  const rows = await tx.select({ id: labs.id }).from(labs).where(eq(labs.slug, lab)).limit(1);
  const row = rows[0];
  if (row === undefined) {
    throw new Error(`lab ${lab} is not in the catalog`);
  }
  return row.id;
}

async function loadTracked(tx: SignalDb, lab: OfficialListLab): Promise<Map<string, number>> {
  const rows = await tx
    .select({ id: models.id, slug: models.slug })
    .from(models)
    .innerJoin(labs, eq(models.labId, labs.id))
    .where(eq(labs.slug, lab));
  return new Map(rows.map((row) => [row.slug, row.id]));
}

function secretValues(keys: OfficialModelListKeys): string[] {
  return [keys.openai, keys.anthropic, keys.google].filter((key): key is string => key !== null);
}
