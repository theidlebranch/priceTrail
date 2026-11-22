import { assertPublicSlug } from "@/app/models/model-list-entries";

/**
 * Turn lab rows into the lines the labs page renders.
 *
 * A lab with no models still appears, with a count of zero. An empty
 * name, a bad slug, a count that is not a whole number, or two rows
 * with the same slug throws. An empty array is a real empty catalog.
 */

export type LabListRow = {
  name: string;
  slug: string;
  modelCount: number;
};

export type LabListEntry = {
  name: string;
  slug: string;
  modelCountLabel: string;
};

export function toLabListEntries(rows: readonly LabListRow[]): LabListEntry[] {
  const seen = new Set<string>();
  return rows.map((row) => {
    const name = row.name.trim();
    if (name.length === 0) {
      throw new Error("lab name is empty");
    }
    assertPublicSlug(row.slug, "lab");
    if (!Number.isInteger(row.modelCount) || row.modelCount < 0) {
      throw new Error("model count is not a whole number");
    }
    if (seen.has(row.slug)) {
      throw new Error(`two labs share the slug ${row.slug}`);
    }
    seen.add(row.slug);
    return {
      name,
      slug: row.slug,
      modelCountLabel: row.modelCount === 1 ? "1 model" : `${row.modelCount} models`,
    };
  });
}

export function labCountLabel(count: number): string {
  return count === 1 ? "1 lab" : `${count} labs`;
}
