import { and, eq } from "drizzle-orm";
import type { SignalDb } from "@/server/pipeline/read-litellm-signal";
import { LITELLM_AGGREGATOR_ALIASES } from "@/server/sources/litellm-signal";
import { labs, modelAliases, models } from "@/server/db/schema";

/**
 * Add the checked LiteLLM names for models we already track.
 *
 * A second run inserts nothing. A missing model throws before any new
 * alias is written. An alias that already points at another model throws.
 * This does not call publishPriceVersion().
 */
export async function plantLiteLLMAliases(db: SignalDb): Promise<{ inserted: number }> {
  return db.transaction(async (tx) => {
    let inserted = 0;
    for (const entry of LITELLM_AGGREGATOR_ALIASES) {
      const labRows = await tx
        .select({ id: labs.id })
        .from(labs)
        .where(eq(labs.slug, entry.labSlug))
        .limit(1);
      const lab = labRows[0];
      if (lab === undefined) {
        throw new Error(`lab ${entry.labSlug} is not in the catalog`);
      }
      const modelRows = await tx
        .select({ id: models.id })
        .from(models)
        .where(and(eq(models.labId, lab.id), eq(models.slug, entry.modelSlug)))
        .limit(1);
      const model = modelRows[0];
      if (model === undefined) {
        throw new Error(`model ${entry.modelSlug} is not in the catalog`);
      }
      const aliasRows = await tx
        .select({
          modelId: modelAliases.modelId,
          kind: modelAliases.kind,
        })
        .from(modelAliases)
        .where(eq(modelAliases.alias, entry.alias))
        .limit(1);
      const alias = aliasRows[0];
      if (alias !== undefined) {
        if (alias.modelId !== model.id || alias.kind !== "aggregator_slug") {
          throw new Error(`alias ${entry.alias} is already used`);
        }
        continue;
      }
      await tx.insert(modelAliases).values({
        modelId: model.id,
        alias: entry.alias,
        kind: "aggregator_slug",
      });
      inserted += 1;
    }
    return { inserted };
  });
}
