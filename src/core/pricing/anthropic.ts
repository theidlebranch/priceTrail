import { Decimal } from "decimal.js";
import {
  normalizedPriceSchema,
  type Condition,
  type NormalizedPrice,
} from "./shape";

const MODEL_HEADER = "Model";

const PRICE_COLUMNS = [
  { header: "Base input tokens", dimension: "input" },
  { header: "5m cache writes", dimension: "cache_write_5m" },
  { header: "1h cache writes", dimension: "cache_write_1h" },
  { header: "Cache hits and refreshes", dimension: "cache_read" },
  { header: "Output tokens", dimension: "output" },
] as const;

type AnthropicDimension = (typeof PRICE_COLUMNS)[number]["dimension"];
type AnthropicAmounts = Record<AnthropicDimension, string>;

const REQUIRED_PRICE_HEADERS = PRICE_COLUMNS.map((column) => column.header);
const PRICE_HEADER_SET = new Set<string>(REQUIRED_PRICE_HEADERS);

const PRICE_PATTERN = /^\$(\d+(?:\.\d+)?)\s*\/\s*MTok$/;
const TIER_PATTERN = /^for prompts (up to|over) ([\d,]+) tokens$/i;
const TIER_LIKE_PATTERN = /^for prompts\b/i;

const CACHE_WRITE_5M_MULTIPLIER = new Decimal("1.25");
const CACHE_WRITE_1H_MULTIPLIER = new Decimal("2");

type MarkdownTable = {
  headers: string[];
  rows: string[][];
};

export type AnthropicParseResult = {
  rows: NormalizedPrice[];
  warnings: string[];
};

export function parseAnthropicPricing(markdown: string): AnthropicParseResult {
  const tables = parseMarkdownTables(markdown);
  const candidates = tables.filter(isPricingTableCandidate);

  if (candidates.length === 0) {
    throw new Error("0 matching tables: expected exactly one Anthropic model pricing table");
  }
  if (candidates.length > 1) {
    throw new Error(
      `${candidates.length} matching tables: expected exactly one Anthropic model pricing table`,
    );
  }

  const [table] = candidates;
  const missing = REQUIRED_PRICE_HEADERS.filter(
    (header) => !table.headers.includes(header),
  );
  if (missing.length > 0) {
    throw new Error(`missing required column: ${missing.join(", ")}`);
  }
  if (!table.headers.includes(MODEL_HEADER)) {
    throw new Error(`missing required column: ${MODEL_HEADER}`);
  }
  if (table.rows.length === 0) {
    throw new Error("empty table: Anthropic model pricing table has no rows");
  }

  const warnings: string[] = [];
  const unmappedColumns = table.headers.filter(
    (header) => header !== MODEL_HEADER && !PRICE_HEADER_SET.has(header),
  );
  if (unmappedColumns.length > 0) {
    warnings.push(`unmappedColumns: ${unmappedColumns.join(", ")}`);
  }

  const rows: NormalizedPrice[] = [];
  for (const rawRow of table.rows) {
    const cells = cellsByHeader(table.headers, rawRow);
    const model = parseModelCell(cells.get(MODEL_HEADER) ?? "");
    const amounts = {} as AnthropicAmounts;

    for (const column of PRICE_COLUMNS) {
      amounts[column.dimension] = parsePriceCell(
        cells.get(column.header) ?? "",
        `${model.modelName} / ${column.header}`,
      );
    }

    warnings.push(...checkMultipliers(model.modelName, amounts));

    for (const column of PRICE_COLUMNS) {
      rows.push(
        normalizedPriceSchema.parse({
          provider: "anthropic",
          modelName: model.modelName,
          modelSlug: model.modelSlug,
          dimension: column.dimension,
          usdPer1M: amounts[column.dimension],
          condition: model.condition,
          source: "official",
          note: model.note,
        }),
      );
    }
  }

  return { rows, warnings };
}

function parseMarkdownTables(markdown: string): MarkdownTable[] {
  const tables: MarkdownTable[] = [];
  let current: string[] = [];

  const flush = () => {
    if (current.length === 0) {
      return;
    }
    const table = parseTableLines(current);
    if (table) {
      tables.push(table);
    }
    current = [];
  };

  for (const line of markdown.split(/\r?\n/)) {
    if (line.trim().startsWith("|")) {
      current.push(line);
    } else {
      flush();
    }
  }
  flush();
  return tables;
}

function parseTableLines(lines: string[]): MarkdownTable | null {
  if (lines.length < 2) {
    return null;
  }

  const headers = splitRow(lines[0]);
  if (!isSeparatorRow(splitRow(lines[1]))) {
    return null;
  }

  const rows = lines.slice(2).map(splitRow);
  return { headers, rows };
}

function splitRow(line: string): string[] {
  const trimmed = line.trim();
  const withoutEdges = trimmed
    .replace(/^\|/, "")
    .replace(/\|$/, "");
  return withoutEdges.split("|").map((cell) => cell.trim());
}

function isSeparatorRow(cells: string[]): boolean {
  return cells.length > 0 && cells.every((cell) => /^:?-+:?$/.test(cell));
}

function isPricingTableCandidate(table: MarkdownTable): boolean {
  const hasModel = table.headers.includes(MODEL_HEADER);
  const hasPriceHeader = REQUIRED_PRICE_HEADERS.some((header) =>
    table.headers.includes(header),
  );
  return hasModel && hasPriceHeader;
}

function cellsByHeader(headers: string[], row: string[]): Map<string, string> {
  if (row.length < headers.length) {
    throw new Error(
      `row has ${row.length} cells, expected ${headers.length} (${row[0] || "unknown model"})`,
    );
  }

  const cells = new Map<string, string>();
  headers.forEach((header, index) => {
    cells.set(header, row[index] ?? "");
  });
  return cells;
}

function parsePriceCell(raw: string, context: string): string {
  const cleaned = raw.replace(/<sup>.*?<\/sup>/gi, "").trim();
  const match = cleaned.match(PRICE_PATTERN);
  if (!match) {
    throw new Error(
      `unrecognized cell format (expected $X / MTok) in ${context}: ${raw}`,
    );
  }
  return new Decimal(match[1]).toFixed();
}

function parseModelCell(raw: string): {
  modelName: string;
  modelSlug: string;
  note?: string;
  condition?: Condition;
} {
  const withoutLinks = stripMarkdownLinks(raw).replace(/\s+/g, " ").trim();
  if (!withoutLinks) {
    throw new Error("empty table: model cell is empty");
  }

  const parenthetical = withoutLinks.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
  if (!parenthetical) {
    return {
      modelName: withoutLinks,
      modelSlug: pageLabelSlug(withoutLinks),
    };
  }

  const modelName = parenthetical[1].trim();
  const inner = parenthetical[2].trim();

  if (TIER_LIKE_PATTERN.test(inner)) {
    const tier = inner.match(TIER_PATTERN);
    if (!tier) {
      throw new Error(`unparseable tier parenthetical: (${inner})`);
    }
    const bound = Number(tier[2].replace(/,/g, ""));
    const condition: Condition =
      tier[1].toLowerCase() === "up to"
        ? { promptTokensAtMost: bound }
        : { promptTokensOver: bound };
    return {
      modelName,
      modelSlug: pageLabelSlug(modelName),
      condition,
    };
  }

  return {
    modelName,
    modelSlug: pageLabelSlug(modelName),
    note: inner,
  };
}

function stripMarkdownLinks(text: string): string {
  return text.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
}

function pageLabelSlug(modelName: string): string {
  return modelName
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, "-")
    .replace(/^-+|-+$/g, "");
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

function checkMultipliers(modelName: string, amounts: AnthropicAmounts): string[] {
  const input = new Decimal(amounts.input);
  const expectedByDimension: Partial<Record<AnthropicDimension, Decimal>> = {
    cache_write_5m: input.mul(CACHE_WRITE_5M_MULTIPLIER),
    cache_write_1h: input.mul(CACHE_WRITE_1H_MULTIPLIER),
    cache_read: input.mul(cacheReadMultiplier(modelName)),
  };

  const warnings: string[] = [];
  for (const [dimension, expected] of Object.entries(expectedByDimension) as [
    AnthropicDimension,
    Decimal,
  ][]) {
    const actual = new Decimal(amounts[dimension]);
    if (!actual.equals(expected)) {
      warnings.push(
        `multiplier mismatch for ${modelName} ${dimension}: expected ${expected.toFixed()}, got ${actual.toFixed()}`,
      );
    }
  }
  return warnings;
}
