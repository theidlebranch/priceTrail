/**
 * Turn catalog rows into the links the model list renders.
 *
 * The public address is /models/<lab slug>/<model slug>. A slash inside a
 * slug would add another path piece, so the link would miss the detail
 * route. Two rows with the same address would look like one model. Both
 * cases throw. An empty array is a real empty catalog, not an error.
 */

export type ModelListRow = {
  labName: string;
  labSlug: string;
  name: string;
  slug: string;
  deprecatedAt: Date | null;
};

export type ModelListEntry = {
  labName: string;
  modelName: string;
  href: string;
  retired: boolean;
};

export function toModelListEntries(rows: readonly ModelListRow[]): ModelListEntry[] {
  const entries = rows.map((row) => ({
    labName: row.labName,
    modelName: row.name,
    href: modelHref(row.labSlug, row.slug),
    retired: row.deprecatedAt !== null,
  }));

  const seen = new Set<string>();
  for (const entry of entries) {
    if (seen.has(entry.href)) {
      throw new Error(`two models share the public path ${entry.href}`);
    }
    seen.add(entry.href);
  }

  return entries;
}

function modelHref(labSlug: string, modelSlug: string): string {
  return `/models/${publicSlug(labSlug, "lab")}/${publicSlug(modelSlug, "model")}`;
}

function publicSlug(slug: string, kind: "lab" | "model"): string {
  if (slug.length === 0 || slug.includes("/")) {
    throw new Error(`${kind} slug is empty or contains a slash`);
  }
  return slug;
}
