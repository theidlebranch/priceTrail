import { assertPublicSlug } from "@/app/models/model-list-entries";
import type { ListedFollow } from "@/server/db/repositories/follows";

/**
 * Turn follow rows into the two lists the Following page renders.
 *
 * A lab follow is one row. It does not expand into that lab's models.
 * A bad slug or an empty name throws. An empty array is a real empty
 * list. This file does not open a database.
 */

export type FollowingEntry = {
  id: number;
  name: string;
} & (
  | { kind: "lab"; labSlug: string }
  | {
      kind: "model";
      labName: string;
      labSlug: string;
      modelSlug: string;
      href: string;
      retired: boolean;
    }
);

export function toFollowingEntries(rows: readonly ListedFollow[]): FollowingEntry[] {
  const seen = new Set<number>();
  return rows.map((row) => {
    if (seen.has(row.id)) {
      throw new Error(`two follows share the id ${row.id}`);
    }
    seen.add(row.id);
    const name = row.name.trim();
    if (name.length === 0) {
      throw new Error("follow name is empty");
    }
    assertPublicSlug(row.labSlug, "lab");
    if (row.kind === "lab") {
      return { id: row.id, kind: "lab", name, labSlug: row.labSlug };
    }
    assertPublicSlug(row.modelSlug, "model");
    const labName = row.labName.trim();
    if (labName.length === 0) {
      throw new Error("follow lab name is empty");
    }
    return {
      id: row.id,
      kind: "model",
      name,
      labName,
      labSlug: row.labSlug,
      modelSlug: row.modelSlug,
      href: `/models/${encodeURIComponent(row.labSlug)}/${encodeURIComponent(row.modelSlug)}`,
      retired: row.retired,
    };
  });
}

export function followTabLabel(kind: "lab" | "model", count: number): string {
  if (count === 0) {
    return kind === "lab" ? "Labs" : "Models";
  }
  if (kind === "lab") {
    return count === 1 ? "1 lab" : `${count} labs`;
  }
  return count === 1 ? "1 model" : `${count} models`;
}

/**
 * Open Labs when that list has a row. Open Models when Labs is empty
 * and Models is not. When both are empty, open Labs.
 */
export function initialFollowTab(labCount: number, modelCount: number): "labs" | "models" {
  if (labCount > 0) {
    return "labs";
  }
  if (modelCount > 0) {
    return "models";
  }
  return "labs";
}
