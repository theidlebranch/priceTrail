/**
 * Turn catalog rows into the links the model list renders.
 *
 * The public address is /models/<lab slug>/<model slug>. A slash inside a
 * slug would add another path piece, so the link would miss the detail
 * route. A "#" or "?" would start a fragment or a query, so the browser
 * would open a shorter path. "." and ".." are path steps, and encoding
 * does not change them. Those slugs throw. Every other slug is encoded as
 * one path segment. Two rows with the same address would look like one
 * model. That throws too. An empty array is a real empty catalog, not an
 * error.
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
  const lab = publicSlug(labSlug, "lab");
  const model = publicSlug(modelSlug, "model");
  return `/models/${lab}/${model}`;
}

function publicSlug(slug: string, kind: "lab" | "model"): string {
  if (slug.length === 0 || slug.includes("/") || slug === "." || slug === "..") {
    throw new Error(`${kind} slug is empty, contains a slash, or is "." or ".."`);
  }
  return encodeURIComponent(slug);
}
