import { reviewerId } from "@/core/auth/review-access";

/**
 * A lab suggestion that must not be stored.
 *
 * A blank name, a lab we already track, a second pending copy, or a
 * blank review note all throw this. The caller writes nothing.
 */
export class LabRequestRefusal extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LabRequestRefusal";
  }
}

/**
 * The name the visitor typed, with surrounding spaces removed.
 * A blank name is not a suggestion.
 */
export function checkedLabName(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    throw new LabRequestRefusal("lab name is empty");
  }
  return trimmed;
}

/**
 * The comparison key for a lab name. " OpenAI " and "openai" are one name.
 */
export function labNameKey(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * True when the suggestion is a lab we already list.
 * The match is the stored name or the slug, ignoring case and spaces.
 */
export function matchesTrackedLab(
  name: string,
  tracked: readonly { name: string; slug: string }[],
): boolean {
  const key = labNameKey(name);
  return tracked.some((lab) => labNameKey(lab.name) === key || labNameKey(lab.slug) === key);
}

/**
 * The account id stored on a suggestion and on a decision.
 * It is google:<id> or github:<id>. An email is not an id.
 */
export function checkedAccountId(id: string): string {
  const separator = id.indexOf(":");
  if (separator <= 0) {
    throw new LabRequestRefusal("account id is missing");
  }
  try {
    return reviewerId(id.slice(0, separator), id.slice(separator + 1));
  } catch {
    throw new LabRequestRefusal("account id is missing");
  }
}

/**
 * The note a reviewer types. A blank note writes nothing.
 */
export function checkedReviewNote(note: string): string {
  const trimmed = note.trim();
  if (trimmed.length === 0) {
    throw new LabRequestRefusal("review note is empty");
  }
  return trimmed;
}

/**
 * The request row a decision points at. Zero and fractions are not ids.
 */
export function checkedRequestId(id: number): number {
  if (!Number.isInteger(id) || id <= 0) {
    throw new LabRequestRefusal("request id must be a whole number");
  }
  return id;
}
