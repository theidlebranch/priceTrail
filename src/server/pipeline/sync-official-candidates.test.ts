import { drizzle } from "drizzle-orm/pg-proxy";
import { describe, expect, it } from "vitest";
import type { EvidenceDb } from "@/server/db/repositories/evidence";
import { syncOfficialCandidates } from "@/server/pipeline/sync-official-candidates";

const FETCHED_AT = "2026-05-01T00:00:00.000Z";

function priceRow(modelSlug: string, modelName: string, note?: string) {
  return {
    provider: "anthropic", modelSlug, modelName, dimension: "input",
    usdPer1M: "1", source: "official", note,
  };
}

describe("syncOfficialCandidates", () => {
  it.each([false, true])("reports only conversions that changed a row (inserts: %s)", async (withInsert) => {
    const snapshot = {
      rows: [
        priceRow("converted", "Converted", "retired"),
        priceRow("already-reviewed", "Already Reviewed", "retired"),
        ...(withInsert ? [priceRow("new-model", "New Model")] : []),
      ],
      warnings: [],
    };
    const inserts: unknown[][] = [];
    // Execute real Drizzle query builders against canned database responses.
    const db = drizzle(async (query, params) => {
      if (query.startsWith('update "candidate_models"')) {
        // The reviewed card no longer matches the pending status seen by SELECT.
        return { rows: params.includes("Already Reviewed") ? [] : [[1]] };
      }
      if (query.startsWith('insert into "candidate_models"')) {
        inserts.push(params);
        return { rows: [] };
      }
      if (query.includes('from "observations"')) {
        return { rows: [[query.includes('"fetched_at"') ? FETCHED_AT : 5, snapshot]] };
      }
      if (query.includes('from "labs"')) return { rows: [[3]] };
      if (query.includes('from "models"')) return { rows: [] };
      if (query.includes('from "candidate_models"')) {
        return { rows: [
          [1, "converted", "new_name", "pending_review"],
          [2, "already-reviewed", "new_name", "pending_review"],
        ] };
      }
      if (query.includes('from "fetch_log"')) {
        if (query.startsWith('select "fetched_at"')) return { rows: [[FETCHED_AT]] };
        return { rows: [["changed", 5]] };
      }
      throw new Error(`Unexpected query: ${query}`);
    });

    await expect(syncOfficialCandidates(db as unknown as EvidenceDb, {
      sourceId: 4, labSlug: "anthropic",
    })).resolves.toEqual([
      { kind: "retirement", modelName: "Converted", modelSlug: "converted" },
      ...(withInsert ? [{ kind: "new_name", modelName: "New Model", modelSlug: "new-model" }] : []),
    ]);
    expect(inserts).toEqual(withInsert ? [expect.arrayContaining(["new-model", "new_name"])] : []);
  });
});
