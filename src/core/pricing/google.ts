import { load, type CheerioAPI } from "cheerio";
import { Decimal } from "decimal.js";
import {
  normalizedPriceSchema,
  type Condition,
  type NormalizedPrice,
} from "./shape";

const OUT_OF_MVP_MODES = new Set(["batch", "flex", "priority", "contributor"]);

const MONTHS: Record<string, number> = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
};

const DAYS_IN_MONTH = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

const TIER_AT_MOST = /^\$(\d+(?:\.\d+)?), prompts <= (\d+)k(?: tokens)?\.?$/i;
const TIER_OVER = /^\$(\d+(?:\.\d+)?), prompts > (\d+)k(?: tokens)?\.?$/i;
const VALID_UNTIL = /^\$(\d+(?:\.\d+)?) through ([A-Za-z]+) (\d{1,2}), (\d{4})\.?$/;
const VALID_FROM = /^\$(\d+(?:\.\d+)?) starting ([A-Za-z]+) (\d{1,2}), (\d{4})\.?$/;
const PLAIN_PRICE = /^\$(\d+(?:\.\d+)?)\.?$/;

type GoogleDimension = "input" | "output" | "cache_read";

type GoogleParseResult = {
  rows: NormalizedPrice[];
  warnings: string[];
};

type ModelSection = {
  modelName: string;
  codes: string[];
  mode: string | null;
};

// One node from the list pricingNodes() returns. We name it this way so the
// file does not import Cheerio's DOM package, which this app does not depend on.
type MarkupNode = ReturnType<typeof pricingNodes>[number];

export function parseGooglePricing(html: string): GoogleParseResult {
  const $ = load(html);
  assertEnglish($);

  // The October page is HTML tables. The live page is docs markup inside
  // the same URL. A pricing-table node means the old reader still applies.
  if ($("table.pricing-table").length > 0) {
    return parseHtmlPricing($);
  }

  return parseMarkupPricing(markupSource($));
}

function assertEnglish($: CheerioAPI): void {
  const lang = $("html").attr("lang") ?? "";
  if (!lang.toLowerCase().startsWith("en")) {
    throw new Error(`page language is not English: html lang="${lang}"`);
  }
}

function parseHtmlPricing($: CheerioAPI): GoogleParseResult {
  const warnings: string[] = [];
  const rows: NormalizedPrice[] = [];
  let section: ModelSection | null = null;
  let standardTables = 0;
  const nodes = pricingNodes($).toArray();

  for (const node of nodes) {
    if (!isMarkupNode(node)) {
      continue;
    }

    if (node.name === "h2") {
      section = readModelSection($, node);
      continue;
    }

    if (node.name === "h3") {
      if (section) {
        section = { ...section, mode: readMode($, node) };
      }
      continue;
    }

    if (section?.mode === "standard") {
      standardTables += 1;
      rows.push(...parseStandardTable($, node, section, warnings));
      continue;
    }

    warnings.push(skipWarning(section));
  }

  if (standardTables === 0) {
    throw new Error("0 Standard pricing tables: expected at least one");
  }

  return { rows, warnings };
}

/**
 * The live page keeps its prices in a noscript block. Cheerio does not
 * parse inside noscript, so the tags and the &quot; escapes are still text.
 * Loading that text once turns it into the markup the rest of this reader
 * walks. A small test page can put the same markup in pre instead.
 */
function markupSource($: CheerioAPI): string {
  const noscript = $("noscript")
    .toArray()
    .map((node) => $(node).text())
    .find((text) => text.includes("{% tab") || text.includes("{% table"));
  if (noscript) {
    return load(noscript).root().text();
  }

  const pre = $("pre")
    .toArray()
    .map((node) => $(node).text())
    .find((text) => text.includes("{% tab") || text.includes("{% table"));
  if (pre) {
    return pre;
  }

  return $("body").text();
}

function parseMarkupPricing(markup: string): GoogleParseResult {
  const warnings: string[] = [];
  const rows: NormalizedPrice[] = [];
  let standardTables = 0;
  const sections = markup.split(/^(?=## )/m).filter((section) => section.startsWith("## "));

  for (const section of sections) {
    const read = readMarkupSection(section, warnings);
    standardTables += read.standardTables;
    rows.push(...read.rows);
  }

  if (standardTables === 0) {
    throw new Error("0 Standard pricing tables: expected at least one");
  }

  return { rows, warnings };
}

type MarkupSection = {
  modelName: string;
  ids: string[];
};

type MarkupRead = {
  rows: NormalizedPrice[];
  standardTables: number;
};

function readMarkupSection(section: string, warnings: string[]): MarkupRead {
  const headingLine = section.split(/\r?\n/, 1)[0] ?? "";
  const model: MarkupSection = {
    modelName: markupModelName(headingLine),
    ids: [...headingLine.matchAll(/\{%\s*id="([^"]+)"\s*%\}/g)].map((match) => match[1]),
  };
  const tabs = [
    ...section.matchAll(/\{%\s*tab\s+title="([^"]+)"\s*%\}([\s\S]*?)\{%\s*\/tab\s*%\}/g),
  ];

  if (tabs.length > 0) {
    return readMarkupTabs(tabs, model, warnings);
  }

  const table = section.match(/\{%\s*table\s*%\}([\s\S]*?)\{%\s*\/table\s*%\}/);
  if (!table?.[1] || !markupHasPaidHeader(table[1])) {
    if (table) {
      warnings.push(skipWarning({ modelName: model.modelName, codes: model.ids, mode: null }));
    }
    return { rows: [], standardTables: 0 };
  }

  return readMarkupStandardTable(table[1], model, warnings);
}

function readMarkupTabs(
  tabs: RegExpMatchArray[],
  model: MarkupSection,
  warnings: string[],
): MarkupRead {
  const read: MarkupRead = { rows: [], standardTables: 0 };

  for (const tab of tabs) {
    const title = (tab[1] ?? "").trim().toLowerCase();
    const body = tab[2] ?? "";
    if (title !== "standard") {
      warnings.push(
        skipWarning({
          modelName: model.modelName,
          codes: model.ids,
          mode: title,
        }),
      );
      continue;
    }

    const table = body.match(/\{%\s*table\s*%\}([\s\S]*?)\{%\s*\/table\s*%\}/);
    const standard = readMarkupStandardTable(table?.[1] ?? "", model, warnings);
    read.standardTables += standard.standardTables;
    read.rows.push(...standard.rows);
  }

  return read;
}

function readMarkupStandardTable(
  tableBody: string,
  model: MarkupSection,
  warnings: string[],
): MarkupRead {
  if (!model.modelName) {
    throw new Error("empty model heading");
  }
  if (model.ids.length === 0) {
    throw new Error(`0 model codes for Standard table: ${model.modelName}`);
  }
  if (model.ids.length > 1) {
    warnings.push(`multiple model codes: expected exactly one (${model.ids.join(", ")})`);
    return { rows: [], standardTables: 1 };
  }

  const modelSlug = model.ids[0];
  const blocks = tableBody
    .split(/^\s*---\s*$/m)
    .map((block) => block.trim())
    .filter((block) => block.length > 0);
  if (blocks.length < 2) {
    throw new Error(`empty table: Standard pricing table for ${modelSlug} has no rows`);
  }

  const headers = readBulletCells(blocks[0] ?? "").map((cell) => cell.join(" "));
  const paidIndexes = headers
    .map((header, index) => ({ header, index }))
    .filter((column) => column.header.startsWith("Paid Tier"));
  if (paidIndexes.length > 1) {
    throw new Error(`duplicate paid column for ${modelSlug}`);
  }
  const paidColumn = paidIndexes[0];
  if (!paidColumn || !paidColumn.header.includes("per 1M tokens in USD")) {
    throw new Error('missing paid unit: expected header containing "per 1M tokens in USD"');
  }

  const seenLabels = new Set<string>();
  const rows: NormalizedPrice[] = [];

  for (const block of blocks.slice(1)) {
    const cells = readBulletCells(block);
    const label = cleanText(cells[0]?.join(" ") ?? "")
      .replace(/\*+$/, "")
      .trim();
    if (!label) {
      throw new Error(`empty price label for ${modelSlug}`);
    }

    const dimension = dimensionForLabel(label);
    if (dimension === "ignore") {
      continue;
    }
    if (dimension === "unmapped") {
      warnings.push(`unmapped label: ${label} (${modelSlug})`);
      continue;
    }
    if (seenLabels.has(label)) {
      throw new Error(`duplicate price label: ${label} for ${modelSlug}`);
    }
    seenLabels.add(label);

    const paidCell = cells[paidColumn.index];
    if (!paidCell || paidCell.length === 0) {
      throw new Error(`missing paid cell for ${modelSlug} / ${label}`);
    }

    for (const segment of paidCell) {
      const row = classifySegment(
        segment,
        {
          modelName: model.modelName,
          modelSlug,
          dimension,
          label,
        },
        warnings,
      );
      if (row) {
        rows.push(row);
      }
    }
  }

  return { rows, standardTables: 1 };
}

function markupHasPaidHeader(tableBody: string): boolean {
  const headerBlock = tableBody.split(/^\s*---\s*$/m)[0] ?? "";
  return readBulletCells(headerBlock).some((cell) => {
    const header = cell.join(" ");
    return header.startsWith("Paid Tier") && header.includes("per 1M tokens in USD");
  });
}

function readBulletCells(block: string): string[][] {
  const cells: string[][] = [];
  let current: string[] | null = null;

  for (const line of block.split(/\r?\n/)) {
    const trimmed = line.trim().replace(/\\+$/, "").trim();
    if (!trimmed) {
      continue;
    }

    const bullet = trimmed.match(/^\*\s*(.*)$/);
    if (bullet) {
      if (current) {
        cells.push(current.filter((segment) => segment.length > 0));
      }
      current = [cleanMarkupSegment(bullet[1] ?? "")];
      continue;
    }

    if (current) {
      current.push(cleanMarkupSegment(trimmed));
    }
  }

  if (current) {
    cells.push(current.filter((segment) => segment.length > 0));
  }

  return cells;
}

function cleanMarkupSegment(raw: string): string {
  const withoutSup = raw
    .replace(/\{%\s*sup\s*%\}[\s\S]*?\{%\s*\/sup\s*%\}/gi, "")
    .replace(/\{%\s*sup\s*\/%\}/gi, "");
  return cleanText(withoutSup);
}

function markupModelName(headingLine: string): string {
  const withoutIds = headingLine.replace(/^##\s+/, "").replace(/\{%\s*id="[^"]+"\s*%\}/g, "");
  return cleanText(withoutIds.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1"));
}

function pricingNodes($: CheerioAPI) {
  const article = $(".devsite-article-body");
  const root = article.length > 0 ? article : $("body");
  return root.find("h2, h3, table.pricing-table");
}

function readModelSection($: CheerioAPI, heading: MarkupNode): ModelSection {
  const modelName = cleanText($(heading).text());
  if (!modelName) {
    throw new Error("empty model heading");
  }

  const group = $(heading).closest(".heading-group");
  const codes =
    group.length > 0
      ? group
          .find("code")
          .toArray()
          .map((code) => cleanText($(code).text()))
          .filter((code) => code.length > 0)
      : [];

  return { modelName, codes, mode: null };
}

function readMode($: CheerioAPI, heading: MarkupNode): string {
  const id = ($(heading).attr("id") ?? "").replace(/_\d+$/, "").trim().toLowerCase();
  if (id) {
    return id;
  }
  return cleanText($(heading).text()).toLowerCase();
}

function parseStandardTable(
  $: CheerioAPI,
  table: MarkupNode,
  section: ModelSection,
  warnings: string[],
): NormalizedPrice[] {
  if (section.codes.length === 0) {
    throw new Error(`0 model codes for Standard table: ${section.modelName}`);
  }
  if (section.codes.length > 1) {
    warnings.push(
      `multiple model codes: expected exactly one (${section.codes.join(", ")})`,
    );
    return [];
  }

  const modelSlug = section.codes[0];
  const headers = $(table)
    .find("thead th")
    .toArray()
    .map((header) => cleanText($(header).text()));
  const paidIndexes = headers
    .map((header, index) => ({ header, index }))
    .filter((column) => column.header.startsWith("Paid Tier"));

  if (paidIndexes.length > 1) {
    throw new Error(`duplicate paid column for ${modelSlug}`);
  }
  const paidColumn = paidIndexes[0];
  if (!paidColumn || !paidColumn.header.includes("per 1M tokens in USD")) {
    throw new Error(
      'missing paid unit: expected header containing "per 1M tokens in USD"',
    );
  }

  const bodyRows = $(table).find("tbody tr").toArray();
  if (bodyRows.length === 0) {
    throw new Error(`empty table: Standard pricing table for ${modelSlug} has no rows`);
  }

  const seenLabels = new Set<string>();
  const parsed: NormalizedPrice[] = [];

  for (const bodyRow of bodyRows) {
    const cells = $(bodyRow).find("td").toArray();
    const label = cleanText($(cells[0]).text()).replace(/\*+$/, "").trim();
    if (!label) {
      throw new Error(`empty price label for ${modelSlug}`);
    }

    const dimension = dimensionForLabel(label);
    if (dimension === "ignore") {
      continue;
    }
    if (dimension === "unmapped") {
      warnings.push(`unmapped label: ${label} (${modelSlug})`);
      continue;
    }
    if (seenLabels.has(label)) {
      throw new Error(`duplicate price label: ${label} for ${modelSlug}`);
    }
    seenLabels.add(label);

    const paidCell = cells[paidColumn.index];
    if (!paidCell) {
      throw new Error(`missing paid cell for ${modelSlug} / ${label}`);
    }

    parsed.push(
      ...parsePaidCell(
        $(paidCell).html() ?? "",
        {
          modelName: section.modelName,
          modelSlug,
          dimension,
          label,
        },
        warnings,
      ),
    );
  }

  return parsed;
}

function parsePaidCell(
  cellHtml: string,
  price: {
    modelName: string;
    modelSlug: string;
    dimension: GoogleDimension;
    label: string;
  },
  warnings: string[],
): NormalizedPrice[] {
  const rows: NormalizedPrice[] = [];
  // .text() glues <br> lines into one string, so two prices look like one.
  const segments = cellHtml
    .split(/<br\s*\/?>/i)
    .map((segment) => cleanText(load(segment).text()))
    .filter((segment) => segment.length > 0);

  for (const segment of segments) {
    const row = classifySegment(segment, price, warnings);
    if (row) {
      rows.push(row);
    }
  }

  return rows;
}

function classifySegment(
  segment: string,
  price: {
    modelName: string;
    modelSlug: string;
    dimension: GoogleDimension;
    label: string;
  },
  warnings: string[],
): NormalizedPrice | null {
  if (/^(not available|free of charge)$/i.test(segment)) {
    return null;
  }
  if (/implicit caching only/i.test(segment) && !/\$/.test(segment)) {
    return null;
  }
  if (/\(storage price\)/i.test(segment)) {
    warnings.push(`unmapped storage price for ${price.modelSlug}: ${segment}`);
    return null;
  }
  if (hasModalityParenthetical(segment)) {
    warnings.push(
      `unmapped modality price for ${price.modelSlug} ${price.dimension}: ${segment}`,
    );
    return null;
  }

  const atMost = segment.match(TIER_AT_MOST);
  if (atMost) {
    return priceRow(price, atMost[1], { promptTokensAtMost: tokenBound(atMost[2]) });
  }
  const over = segment.match(TIER_OVER);
  if (over) {
    return priceRow(price, over[1], { promptTokensOver: tokenBound(over[2]) });
  }
  if (/prompts/i.test(segment)) {
    throw new Error(`unparseable tier in ${price.modelSlug} / ${price.label}: ${segment}`);
  }

  const validUntil = segment.match(VALID_UNTIL);
  if (validUntil) {
    return priceRow(price, validUntil[1], undefined, {
      validUntil: isoDate(validUntil[2], validUntil[3], validUntil[4]),
    });
  }
  const validFrom = segment.match(VALID_FROM);
  if (validFrom) {
    return priceRow(price, validFrom[1], undefined, {
      validFrom: isoDate(validFrom[2], validFrom[3], validFrom[4]),
    });
  }
  if (isUnmappedUnit(segment)) {
    warnings.push(`unmapped unit for ${price.modelSlug} ${price.dimension}: ${segment}`);
    return null;
  }
  if (/\b(?:through|starting)\b/i.test(segment)) {
    throw new Error(
      `unrecognized cell format in ${price.modelSlug} / ${price.label}: ${segment}`,
    );
  }

  const plain = segment.match(PLAIN_PRICE);
  if (plain) {
    return priceRow(price, plain[1]);
  }

  throw new Error(
    `unrecognized cell format in ${price.modelSlug} / ${price.label}: ${segment}`,
  );
}

function priceRow(
  price: {
    modelName: string;
    modelSlug: string;
    dimension: GoogleDimension;
  },
  amount: string,
  condition?: Condition,
  dates?: { validFrom?: string; validUntil?: string },
): NormalizedPrice {
  return normalizedPriceSchema.parse({
    provider: "google",
    modelName: price.modelName,
    modelSlug: price.modelSlug,
    dimension: price.dimension,
    usdPer1M: new Decimal(amount).toFixed(),
    condition,
    validFrom: dates?.validFrom,
    validUntil: dates?.validUntil,
    source: "official",
  });
}

function dimensionForLabel(
  label: string,
): GoogleDimension | "ignore" | "unmapped" {
  if (label === "Used to improve our products") {
    return "ignore";
  }
  if (label === "Input price") {
    return "input";
  }
  if (label === "Output price" || label === "Output price (including thinking tokens)") {
    return "output";
  }
  if (label === "Context caching price") {
    return "cache_read";
  }
  return "unmapped";
}

function hasModalityParenthetical(segment: string): boolean {
  return /\([^)]*\b(?:text|images?|videos?|audio|thinking)\b[^)]*\)/i.test(segment);
}

function isUnmappedUnit(segment: string): boolean {
  return (
    /\bimages?\b/i.test(segment) ||
    /equivalent to/i.test(segment) ||
    /\/min\b/i.test(segment) ||
    /\bper\s+(?:second|minute|song|frame)\b/i.test(segment) ||
    /\bor\s+\$/i.test(segment)
  );
}

function tokenBound(thousands: string): number {
  const bound = Number(thousands) * 1000;
  if (!Number.isInteger(bound) || bound <= 0) {
    throw new Error(`unparseable tier bound: ${thousands}k`);
  }
  return bound;
}

function isoDate(monthName: string, dayText: string, yearText: string): string {
  const month = MONTHS[monthName.toLowerCase()];
  const day = Number(dayText);
  const year = Number(yearText);
  const maxDay = month === 2 && isLeapYear(year) ? 29 : DAYS_IN_MONTH[month] ?? 0;
  if (!month || !Number.isInteger(day) || day < 1 || day > maxDay || !Number.isInteger(year)) {
    throw new Error(`unrecognized date: ${monthName} ${dayText}, ${yearText}`);
  }

  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function skipWarning(section: ModelSection | null): string {
  if (section && section.mode && OUT_OF_MVP_MODES.has(section.mode)) {
    const who = section.codes[0] ?? section.modelName;
    return `outOfMvp: skipped ${section.mode} table for ${who}`;
  }

  const who = section?.modelName ?? "unknown section";
  return `skipped table without a Standard heading for ${who}`;
}

function cleanText(raw: string): string {
  return raw.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function isMarkupNode(node: { type: string; name?: string }): node is MarkupNode {
  return node.type === "tag" && typeof node.name === "string";
}
