import { reviewerId } from "@/core/auth/review-access";

/**
 * A follow that must not be stored.
 *
 * A bad account id, or a model or lab that is not tracked, throws this.
 * The caller writes nothing.
 */
export class FollowRefusal extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FollowRefusal";
  }
}

export type FollowTarget =
  | { kind: "model"; modelId: number }
  | { kind: "lab"; labId: number };

/**
 * The account id stored on a follow.
 * It is google:<id> or github:<numeric id>. An email is not an id.
 */
export function checkedFollowAccountId(id: string): string {
  const separator = id.indexOf(":");
  if (separator <= 0) {
    throw new FollowRefusal("account id is missing");
  }
  try {
    return reviewerId(id.slice(0, separator), id.slice(separator + 1));
  } catch {
    throw new FollowRefusal("account id is missing");
  }
}

/**
 * The model or lab this follow points at.
 * Exactly one id is set. Zero and a fraction are not a real row.
 */
export function checkedFollowTarget(target: FollowTarget): FollowTarget {
  if (target.kind === "model") {
    return { kind: "model", modelId: checkedTargetId(target.modelId, "that model is not tracked") };
  }
  return { kind: "lab", labId: checkedTargetId(target.labId, "that lab is not tracked") };
}

function checkedTargetId(id: number, message: string): number {
  if (!Number.isInteger(id) || id <= 0) {
    throw new FollowRefusal(message);
  }
  return id;
}
