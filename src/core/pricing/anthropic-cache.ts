import { Decimal } from "decimal.js";

/**
 * Anthropic's own cache ratios, from the pricing page footnotes.
 *
 * A 5-minute write is 1.25 times input. A 1-hour write is 2 times input.
 * A cache read is 0.1 times input, except Opus 5.5 and Sonnet 5.5 (0.05)
 * and Fable 5.1 and Mythos 5.1 (0.025). Comparison uses decimal.js, so
 * "0.10" and "0.1" are the same amount. A mismatch is a warning. The
 * parser still returns the rows. checkParsedPrices is what turns the
 * warning into a suspect result.
 */

const CACHE_WRITE_5M_MULTIPLIER = new Decimal("1.25");
const CACHE_WRITE_1H_MULTIPLIER = new Decimal("2");

export function anthropicCacheMultiplierWarnings(
  modelName: string,
  amounts: {
    input: string;
    cache_write_5m?: string;
    cache_write_1h?: string;
    cache_read?: string;
  },
): string[] {
  const input = new Decimal(amounts.input);
  const checks: Array<[string, string | undefined, Decimal]> = [
    ["cache_write_5m", amounts.cache_write_5m, CACHE_WRITE_5M_MULTIPLIER],
    ["cache_write_1h", amounts.cache_write_1h, CACHE_WRITE_1H_MULTIPLIER],
    ["cache_read", amounts.cache_read, cacheReadMultiplier(modelName)],
  ];

  const warnings: string[] = [];
  for (const [dimension, actualRaw, multiplier] of checks) {
    if (actualRaw === undefined) {
      continue;
    }
    const expected = input.mul(multiplier);
    const actual = new Decimal(actualRaw);
    if (!actual.equals(expected)) {
      warnings.push(
        `multiplier mismatch for ${modelName} ${dimension}: expected ${expected.toFixed()}, got ${actual.toFixed()}`,
      );
    }
  }
  return warnings;
}

function cacheReadMultiplier(modelName: string): Decimal {
  if (modelName === "Claude Fable 5.1" || modelName === "Claude Mythos 5.1") {
    return new Decimal("0.025");
  }
  if (modelName === "Claude Opus 5.5" || modelName === "Claude Sonnet 5.5") {
    return new Decimal("0.05");
  }
  return new Decimal("0.1");
}
