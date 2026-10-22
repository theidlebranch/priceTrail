import { readFile } from "node:fs/promises";
import path from "node:path";
import { parseAnthropicPricing } from "../src/core/pricing/anthropic";
import { compareAnthropicWitness } from "../src/core/pricing/compare-anthropic-witness";
import { parseModelsDevAnthropic } from "../src/core/pricing/models-dev";

/**
 * Print how the models.dev witness lines up with the official Anthropic
 * parser. This does not publish prices. Logic lives in src/core; this
 * file is only I/O.
 */
const FIXTURES_DIR = path.join(process.cwd(), "tests", "fixtures");

async function main(): Promise<void> {
  const officialMarkdown = await readFile(
    path.join(FIXTURES_DIR, "anthropic-pricing.md"),
    "utf8",
  );
  const modelsDevJson = JSON.parse(
    await readFile(path.join(FIXTURES_DIR, "models-dev-sample.json"), "utf8"),
  ) as unknown;

  const official = parseAnthropicPricing(officialMarkdown);
  const witness = parseModelsDevAnthropic(modelsDevJson);
  const report = compareAnthropicWitness(official.rows, witness.rows);

  console.log("official rows:", official.rows.length);
  console.log("witness rows:", witness.rows.length);
  printWarnings("official", official.warnings);
  printWarnings("witness", witness.warnings);

  console.log("matches:", report.matches.length);
  console.log("mismatches:", report.mismatches.length);
  console.log(
    "gaps:",
    report.gaps.length,
    `(witness_missing ${countGaps(report.gaps, "witness_missing")},`,
    `official_missing ${countGaps(report.gaps, "official_missing")},`,
    `uncompared ${countGaps(report.gaps, "uncompared")})`,
  );

  if (report.mismatches.length > 0) {
    console.log("\nmismatches:");
    for (const row of report.mismatches) {
      console.log(
        `  ${row.modelSlug} ${row.dimension}: official ${row.official} vs witness ${row.witness}`,
      );
    }
  }

  const haikuMatches = report.matches.filter(
    (row) => row.modelSlug === "claude-haiku-4.5",
  );
  console.log("\nHaiku 4.5 matches:");
  for (const row of haikuMatches) {
    console.log(`  ${row.dimension} ${row.usdPer1M}`);
  }
}

function printWarnings(label: string, warnings: string[]): void {
  if (warnings.length === 0) {
    return;
  }
  console.log(`${label} warnings:`);
  for (const warning of warnings) {
    console.log(`  ${warning}`);
  }
}

function countGaps(
  gaps: { side: string }[],
  side: string,
): number {
  return gaps.filter((gap) => gap.side === side).length;
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
