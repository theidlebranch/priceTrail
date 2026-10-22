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

const PRICE_COLUMNS = [
  { header: "Short context input", dimension: "input", context: "short" },
  { header: "Short context cached input", dimension: "cache_read", context: "short" },
  { header: "Short context cache writes", dimension: "cache_write", context: "short" },
  { header: "Short context output", dimension: "output", context: "short" },
  { header: "Long context input", dimension: "input", context: "long" },
  { header: "Long context cached input", dimension: "cache_read", context: "long" },
  { header: "Long context cache writes", dimension: "cache_write", context: "long" },
  { header: "Long context output", dimension: "output", context: "long" },
] as const;

type ContextKind = (typeof PRICE_COLUMNS)[number]["context"];

const REQUIRED_PRICE_HEADERS = PRICE_COLUMNS.map((column) => column.header);
const PRICE_HEADER_SET = new Set<string>(REQUIRED_PRICE_HEADERS);
const LONG_COLUMNS = PRICE_COLUMNS.filter((column) => column.context === "long");

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
    throw new Error("0 Standard pricing data headings: expected exactly one");
  }
  if (headingIndexes.length > 1) {
    throw new Error(
      `${headingIndexes.length} Standard pricing data headings: expected exactly one`,
    );
  }

  const sectionStart = headingIndexes[0] + 1;
  const sectionEnd = lines.findIndex(
    (line, index) => index >= sectionStart && /^#{1,6}\s/.test(line.trim()),
  );
  const section = lines
    .slice(sectionStart, sectionEnd === -1 ? undefined : sectionEnd)
    .join("\n");
  const tables = parseMarkdownTables(section);
  if (tables.length === 0) {
    throw new Error("empty table: no table after Standard pricing data heading");
  }

  const [table] = tables;
  const missing = REQUIRED_PRICE_HEADERS.filter(
    (header) => !table.headers.includes(header),
  );
  if (missing.length > 0) {
    throw new Error(`missing required column: ${missing.join(", ")}`);
  }
  if (!table.headers.includes(MODEL_HEADER)) {
    throw new Error(`missing required column: ${MODEL_HEADER}`);
  }
  const duplicates = [MODEL_HEADER, ...REQUIRED_PRICE_HEADERS].filter(
    (header) => table.headers.filter((candidate) => candidate === header).length > 1,
  );
  if (duplicates.length > 0) {
    throw new Error(`duplicate required column: ${duplicates.join(", ")}`);
  }
  if (table.rows.length === 0) {
    throw new Error("empty table: OpenAI Standard pricing table has no rows");
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
    const skipLong = shouldSkipUnthresholdedLongContext(model, cells, warnings);

    for (const column of PRICE_COLUMNS) {
      if (column.context === "long" && skipLong) {
        continue;
      }

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
  }

  if (rows.length === 0) {
    throw new Error("empty table: OpenAI Standard pricing table has no price rows");
  }

  return { rows, warnings };
}

function shouldSkipUnthresholdedLongContext(
  model: ParsedModel,
  cells: Map<string, string>,
  warnings: string[],
): boolean {
  if (model.longCondition) {
    return false;
  }

  const hasLongPrice = LONG_COLUMNS.some((column) => {
    const raw = (cells.get(column.header) ?? "").trim();
    return raw !== "" && raw !== "-";
  });
  if (!hasLongPrice) {
    return false;
  }

  warnings.push(
    `needs_threshold: ${model.modelName} has long-context prices with no stated cutoff`,
  );
  return true;
}

function conditionForContext(model: ParsedModel, context: ContextKind): Condition | undefined {
  return context === "short" ? model.shortCondition : model.longCondition;
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
