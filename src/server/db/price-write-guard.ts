import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * The only production file that may write a price row is the publish module.
 * This check reads source text. It does not open a database.
 *
 * A test file is skipped. A test may plant a row the publisher cannot create.
 * A select, a table definition, and a migration that only changes columns
 * are not writes.
 *
 * The method name and the table name live in separate lists. This file must
 * not contain a real write, or the check would fail on itself. A renamed
 * import is not seen. A write may span lines.
 */

const PUBLISH_MODULE = "src/server/db/publish-price-version.ts";
const SCAN_ROOTS = ["src", "scripts", "drizzle"] as const;
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".mjs", ".sql"]);

const DRIZZLE_METHODS = ["insert", "update", "delete"] as const;
const DRIZZLE_TABLES = ["priceVersions", "priceComponents"] as const;
const SQL_TABLES = ["price_versions", "price_components", "price_version_evidence"] as const;

type PriceWriteFile = {
  path: string;
  source: string;
};

type PriceWriteFinding = {
  path: string;
  line: number;
  text: string;
};

function normalizedPath(filePath: string): string {
  return filePath.replaceAll("\\", "/");
}

function isTestFile(filePath: string): boolean {
  const normalized = normalizedPath(filePath);
  return normalized.endsWith(".test.ts") || normalized.endsWith(".test.tsx");
}

function isPublishModule(filePath: string): boolean {
  const normalized = normalizedPath(filePath);
  return normalized === PUBLISH_MODULE || normalized.endsWith(`/${PUBLISH_MODULE}`);
}

function isAllowedPriceWriter(filePath: string): boolean {
  return isTestFile(filePath) || isPublishModule(filePath);
}

function drizzlePatterns(): RegExp[] {
  const patterns: RegExp[] = [];
  for (const method of DRIZZLE_METHODS) {
    for (const table of DRIZZLE_TABLES) {
      patterns.push(new RegExp(String.raw`\.${method}\(\s*(?:schema\.)?${table}\s*\)`));
    }
  }
  return patterns;
}

function sqlTablePattern(table: string): string {
  return String.raw`(?:(?:"public"|public)\s*\.\s*)?(?:"${table}"|${table})(?!\w)`;
}

function sqlPatterns(): RegExp[] {
  const patterns: RegExp[] = [];
  for (const table of SQL_TABLES) {
    const quoted = sqlTablePattern(table);
    patterns.push(new RegExp(String.raw`\binsert\s+into\s+${quoted}`, "i"));
    patterns.push(new RegExp(String.raw`\bupdate\s+${quoted}`, "i"));
    patterns.push(new RegExp(String.raw`\bdelete\s+from\s+${quoted}`, "i"));
  }
  return patterns;
}

const WRITE_PATTERNS = [...drizzlePatterns(), ...sqlPatterns()];

function lineNumberAt(source: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index; i++) {
    if (source.charCodeAt(i) === 10) {
      line += 1;
    }
  }
  return line;
}

function globalPattern(pattern: RegExp): RegExp {
  const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
  return new RegExp(pattern.source, flags);
}

function firstWrite(source: string, from: number): { index: number; text: string } | null {
  let best: { index: number; text: string } | null = null;
  for (const pattern of WRITE_PATTERNS) {
    const regex = globalPattern(pattern);
    regex.lastIndex = from;
    const match = regex.exec(source);
    if (match?.index === undefined || match[0] === undefined) {
      continue;
    }
    if (best === null || match.index < best.index) {
      best = { index: match.index, text: match[0] };
    }
  }
  return best;
}

export function findForbiddenPriceWrites(file: PriceWriteFile): PriceWriteFinding[] {
  if (isAllowedPriceWriter(file.path)) {
    return [];
  }

  const findings: PriceWriteFinding[] = [];
  let from = 0;
  while (from <= file.source.length) {
    const hit = firstWrite(file.source, from);
    if (hit === null) {
      break;
    }
    findings.push({
      path: normalizedPath(file.path),
      line: lineNumberAt(file.source, hit.index),
      text: hit.text,
    });
    const next = hit.index + hit.text.length;
    if (next <= from) {
      break;
    }
    from = next;
  }
  return findings;
}

export function assertNoForbiddenPriceWrites(files: readonly PriceWriteFile[]): void {
  const findings = files.flatMap((file) => findForbiddenPriceWrites(file));
  if (findings.length === 0) {
    return;
  }

  const details = findings
    .map((finding) => `${finding.path}:${String(finding.line)}: ${finding.text}`)
    .join("\n");
  throw new Error(`Only ${PUBLISH_MODULE} may write a price row.\n${details}`);
}

function toRepoPath(root: string, filePath: string): string {
  return path.relative(root, filePath).split(path.sep).join("/");
}

function walk(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".next") {
        continue;
      }
      found.push(...walk(full));
      continue;
    }
    if (SOURCE_EXTENSIONS.has(path.extname(entry.name))) {
      found.push(full);
    }
  }
  return found;
}

export function listPriceWriteFiles(root: string): PriceWriteFile[] {
  const files: PriceWriteFile[] = [];
  for (const rootName of SCAN_ROOTS) {
    const dir = path.join(root, rootName);
    if (!existsSync(dir)) {
      continue;
    }
    for (const absolute of walk(dir)) {
      const repoPath = toRepoPath(root, absolute);
      if (isTestFile(repoPath)) {
        continue;
      }
      files.push({
        path: repoPath,
        source: readFileSync(absolute, "utf8"),
      });
    }
  }
  return files;
}
