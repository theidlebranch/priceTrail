"use server";

import { refresh } from "next/cache";
import { followResultCopy, refusalSentence, signInToFollow, type FollowCopyKind } from "@/app/follows/follow-copy";
import { FollowRefusal, type FollowTarget } from "@/core/follows/follow";
import { readSignedInAccountId } from "@/server/auth/signed-in-account";
import { createDb } from "@/server/db/client";
import { createCatalogRepository } from "@/server/db/repositories/catalog";
import { followTarget, unfollowTarget, type FollowDb } from "@/server/db/repositories/follows";
import { parseDatabaseEnv } from "@/server/env";

/**
 * Follow or unfollow the model or lab named by the form.
 *
 * A guest writes nothing. A missing model or lab writes nothing. A
 * second follow does not move the first time. This does not call
 * publishPriceVersion().
 */

export type FollowFormState = ({ ok: true } & { title: string; description?: string }) | { ok: false; message: string } | null;

export async function setFollowAction(
  _previous: FollowFormState,
  formData: FormData,
): Promise<FollowFormState> {
  const kind = readKind(formData.get("kind"));
  const intent = readIntent(formData.get("intent"));
  const labSlug = readText(formData.get("labSlug"));
  const modelSlug = readText(formData.get("modelSlug"));
  const accountId = await readSignedInAccountId();
  if (accountId == null) {
    return { ok: false, message: signInToFollow(kind ?? "model") };
  }
  if (kind === null || intent === null || labSlug === null || (kind === "model" && modelSlug === null)) {
    return { ok: false, message: "That follow could not be saved." };
  }

  const { databaseUrl } = parseDatabaseEnv(process.env);
  const { db, close } = createDb(databaseUrl);
  try {
    const resolved = await resolveFollow(db, kind, labSlug, modelSlug);
    if (intent === "follow") {
      const result = await followTarget(db, {
        accountId,
        followedAt: new Date(),
        ...resolved.target,
      });
      if (!result.alreadyFollowed) {
        refresh();
      }
      return {
        ok: true,
        ...followResultCopy({
          name: resolved.name,
          kind,
          outcome: result.alreadyFollowed ? "already" : "followed",
        }),
      };
    }

    const result = await unfollowTarget(db, { accountId, ...resolved.target });
    if (result.removed) {
      refresh();
    }
    return {
      ok: true,
      ...followResultCopy({
        name: resolved.name,
        kind,
        outcome: result.removed ? "removed" : "absent",
      }),
    };
  } catch (error) {
    if (error instanceof FollowRefusal) {
      return { ok: false, message: refusalSentence(error.message, kind) };
    }
    throw error;
  } finally {
    await close();
  }
}

async function resolveFollow(
  db: FollowDb,
  kind: FollowCopyKind,
  labSlug: string,
  modelSlug: string | null,
): Promise<{ name: string; target: FollowTarget }> {
  const catalog = createCatalogRepository(db);
  const lab = await catalog.findLabBySlug(labSlug);
  if (lab === null) {
    throw new FollowRefusal("that lab is not tracked");
  }
  if (kind === "lab") {
    return { name: lab.name, target: { kind: "lab", labId: lab.id } };
  }
  if (modelSlug === null) {
    throw new FollowRefusal("that model is not tracked");
  }
  const model = await catalog.findModelByLabAndSlug(lab.id, modelSlug);
  if (model === null) {
    throw new FollowRefusal("that model is not tracked");
  }
  return { name: model.name, target: { kind: "model", modelId: model.id } };
}

function readKind(value: FormDataEntryValue | null): FollowCopyKind | null {
  if (value === "model" || value === "lab") {
    return value;
  }
  return null;
}

function readIntent(value: FormDataEntryValue | null): "follow" | "unfollow" | null {
  if (value === "follow" || value === "unfollow") {
    return value;
  }
  return null;
}

function readText(value: FormDataEntryValue | null): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}
