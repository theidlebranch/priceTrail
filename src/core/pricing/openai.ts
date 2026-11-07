import { Decimal } from "decimal.js";
import {
  normalizedPriceSchema,
  type Condition,
  type NormalizedPrice,
} from "./shape";

const MODEL_HEADER = "Model";
const UNIT_SENTENCE = "Prices per 1M tokens.";
const STANDARD_HEADING = "### Standard pricing data";
const CONTEXT_BOUNDARY_PATTERN = /^<(\d+)K context length$/i;
const PRICE_PATTERN = /^\$(\d+(?:\.\d+)?)$/;

// The November 2026 page names a 30-minute write and a 12-hour write.
// The October page's single "cache writes" column is not a current header.
const PRICE_COLUMNS = [
  { header: "Short context input", dimension: "input", context: "short" },
  { header: "Short context output", dimension: "output", context: "short" },
  { header: "Short context cached input", dimension: "cache_read", context: "short" },
  { header: "Short context 30m write", dimension: "cache_write_30m", context: "short" },
  { header: "Short context 12h write", dimension: "cache_write_12h", context: "short" },
  { header: "Long context input", dimension: "input", context: "long" },
  { header: "Long context output", dimension: "output", context: "long" },
  { header: "Long context cached input", dimension: "cache_read", context: "long" },
  { header: "Long context 30m write", dimension: "cache_write_30m", context: "long" },
  { header: "Long context 12h write", dimension: "cache_write_12h", context: "long" },
] as const;

type ContextKind = (typeof PRICE_COLUMNS)[number]["context"];

const REQUIRED_PRICE_HEADERS = PRICE_COLUMNS.map((column) => column.header);

type MarkdownTable = {
  headers: string[];
  rows: string[][];
};

type OpenAiParseResult = {
  rows: NormalizedPrice[];
  warnings: string[];
};

type ParsedModel = {
  modelName: string;
  modelSlug: string;
  shortCondition?: Condition;
  longCondition?: Condition;
};

export function parseOpenAiPricing(markdown: string): OpenAiParseResult {
  if (!markdown.includes(UNIT_SENTENCE)) {
    throw new Error(`missing unit sentence: expected '${UNIT_SENTENCE}'`);
  }

  const lines = markdown.split(/\r?\n/);
  const headingIndexes = lines
    .map((line, index) => (line.trim() === STANDARD_HEADING ? index : -1))
    .filter((index) => index >= 0);

  if (headingIndexes.length === 0) {
    throw new Error("0 Standard pricing data headings: expected at least one");
  }

  const warnings: string[] = [];
  const rows: NormalizedPrice[] = [];
  const seenPrices = new Map<string, string>();

  for (let sectionIndex = 0; sectionIndex < headingIndexes.length; sectionIndex += 1) {
    const sectionStart = headingIndexes[sectionIndex] + 1;
    const nextStandard = headingIndexes[sectionIndex + 1];
    const sectionEnd = lines.findIndex((line, index) => {
      if (index < sectionStart) {
        return false;
      }
      if (nextStandard !== undefined && index >= nextStandard) {
        return true;
      }
      return isOtherModeHeading(line);
    });
    const section = lines.slice(sectionStart, sectionEnd === -1 ? undefined : sectionEnd).join("\n");
    readStandardSection(section, warnings, rows, seenPrices);
  }

  if (rows.length === 0) {
    throw new Error("empty table: OpenAI Standard pricing table has no price rows");
  }

  return { rows, warnings };
}

/**
 * One Standard heading owns one table. A later heading can repeat a model
 * when every parsed price and context condition matches. `$4.00` and `$4`
 * are the same price. A different price for that slug throws.
 * The live page repeats gpt-5.6-sol with the same cells.
 */
const SHORT_HEADERS = ["Model", "Input", "Output", "Cached input"] as const;
const SHORT_COLUMNS = [
  { header: "Input", dimension: "input", context: "short" },
  { header: "Output", dimension: "output", context: "short" },
  { header: "Cached input", dimension: "cache_read", context: "short" },
] as const;

function readStandardSection(
  section: string,
  warnings: string[],
  rows: NormalizedPrice[],
  seenPrices: Map<string, string>,
): void {
  const tables = parseMarkdownTables(section);
  if (tables.length === 0) {
    throw new Error("empty table: no table after Standard pricing data heading");
  }

  const fullTables = tables.filter((table) => isFullTable(table.headers));
  const shortTables = tables.filter((table) => isShortTable(table.headers));
  if (fullTables.length + shortTables.length !== tables.length) {
    const other = tables.find((table) => !isFullTable(table.headers) && !isShortTable(table.headers));
    throw new Error(`missing required column: ${(other?.headers ?? []).join(", ")}`);
  }
  if (fullTables.length > 1) {
    throw new Error(
      `${fullTables.length} tables after Standard pricing data heading: expected exactly one`,
    );
  }

  let pricedModels = 0;
  let repeatedModels = 0;
  for (const table of [...fullTables, ...shortTables]) {
    const read = readPriceTable(table, warnings, rows, seenPrices);
    pricedModels += read.pricedModels;
    repeatedModels += read.repeatedModels;
  }

  if (pricedModels === 0 && repeatedModels === 0) {
    throw new Error("empty table: OpenAI Standard pricing table has no price rows");
  }
}

function isFullTable(headers: string[]): boolean {
  return REQUIRED_PRICE_HEADERS.every((header) => headers.includes(header));
}

function isOtherModeHeading(line: string): boolean {
  const match = line.trim().match(/^#{1,6}\s+(.*)$/);
  if (!match) {
    return false;
  }
  // "#### Standard text models" stays in this section. Batch, Flex, and
  // the other mode headings still end it.
  return !/\bStandard\b/i.test(match[1]);
}

function isShortTable(headers: string[]): boolean {
  return (
    !isFullTable(headers) && SHORT_HEADERS.every((header) => headers.includes(header))
  );
}

function readPriceTable(
  table: MarkdownTable,
  warnings: string[],
  rows: NormalizedPrice[],
  seenPrices: Map<string, string>,
): { pricedModels: number; repeatedModels: number } {
  const columns = isFullTable(table.headers) ? PRICE_COLUMNS : SHORT_COLUMNS;
  const knownHeaders = new Set<string>([MODEL_HEADER, ...columns.map((column) => column.header)]);
  if (!table.headers.includes(MODEL_HEADER)) {
    throw new Error(`missing required column: ${MODEL_HEADER}`);
  }
  const duplicates = [...knownHeaders].filter(
    (header) => table.headers.filter((candidate) => candidate === header).length > 1,
  );
  if (duplicates.length > 0) {
    throw new Error(`duplicate required column: ${duplicates.join(", ")}`);
  }
  if (table.rows.length === 0) {
    throw new Error("empty table: OpenAI Standard pricing table has no rows");
  }

  const unmappedColumns = table.headers.filter((header) => !knownHeaders.has(header));
  if (unmappedColumns.length > 0) {
    warnings.push(`unmappedColumns: ${unmappedColumns.join(", ")}`);
  }

  let pricedModels = 0;
  let repeatedModels = 0;
  for (const rawRow of table.rows) {
    const cells = cellsByHeader(table.headers, rawRow);
    const modelCell = cells.get(MODEL_HEADER) ?? "";
    const model = parseModelCell(modelCell);
    const signature = priceSignature(model, cells, columns);
    const previous = seenPrices.get(model.modelSlug);
    if (previous !== undefined) {
      if (previous !== signature) {
        throw new Error(`duplicate model slug: ${model.modelSlug}`);
      }
      repeatedModels += 1;
      continue;
    }
    seenPrices.set(model.modelSlug, signature);

    const before = rows.length;
    for (const column of columns) {
      const amount = parsePriceCell(
        cells.get(column.header) ?? "",
        `${model.modelName} / ${column.header}`,
      );
      if (amount === null) {
        continue;
      }

      rows.push(
        normalizedPriceSchema.parse({
          provider: "openai",
          modelName: model.modelName,
          modelSlug: model.modelSlug,
          dimension: column.dimension,
          usdPer1M: amount,
          condition: conditionForContext(model, column.context),
          source: "official",
        }),
      );
    }
    if (rows.length > before) {
      pricedModels += 1;
    }
  }

  return { pricedModels, repeatedModels };
}

function priceSignature(
  model: ParsedModel,
  cells: Map<string, string>,
  columns: readonly { header: string }[],
): string {
  const prices = columns.map((column) => {
    const amount = parsePriceCell(
      cells.get(column.header) ?? "",
      `${model.modelName} / ${column.header}`,
    );
    return amount ?? "-";
  });
  return JSON.stringify({
    short: model.shortCondition ?? null,
    long: model.longCondition ?? null,
    prices,
  });
}

function conditionForContext(model: ParsedModel, context: ContextKind): Condition | undefined {
  if (context === "short") {
    return model.shortCondition;
  }
  // A stated cutoff stays a token count. A missing cutoff is only a flag.
  // The number 272000 is not written here.
  return model.longCondition ?? { longContext: true };
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
  const withoutEdges = trimmed.replace(/^\|/, "").replace(/\|$/, "");
  return withoutEdges.split("|").map((cell) => cell.trim());
}

function isSeparatorRow(cells: string[]): boolean {
  return cells.length > 0 && cells.every((cell) => /^:?-+:?$/.test(cell));
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

function parsePriceCell(raw: string, context: string): string | null {
  const cleaned = raw.trim();
  if (cleaned === "-") {
    return null;
  }

  const match = cleaned.match(PRICE_PATTERN);
  if (!match) {
    throw new Error(
      `unrecognized cell format (expected $X or -) in ${context}: ${raw}`,
    );
  }
  return new Decimal(match[1]).toFixed();
}

function parseModelCell(raw: string): ParsedModel {
  const cleaned = raw.replace(/\s+/g, " ").trim();
  if (!cleaned) {
    throw new Error("empty table: model cell is empty");
  }

  const parenthetical = cleaned.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
  if (!parenthetical) {
    return {
      modelName: cleaned,
      modelSlug: cleaned,
    };
  }

  const modelName = parenthetical[1].trim();
  const inner = parenthetical[2].trim();
  const boundary = inner.match(CONTEXT_BOUNDARY_PATTERN);
  if (!boundary) {
    throw new Error(`unparseable parenthetical: (${inner})`);
  }

  const bound = Number(boundary[1]) * 1000;
  return {
    modelName,
    modelSlug: modelName,
    shortCondition: { promptTokensUnder: bound },
    longCondition: { promptTokensAtLeast: bound },
  };
}
