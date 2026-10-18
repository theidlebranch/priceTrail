import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { assertHtmlLang } from "./assert-html-lang";

type Source = {
  name: string;
  url: string;
  file: string;
  kind: "official" | "signal";
  /** Official HTML pages that must be English before we save them. */
  assertEnglishHtml?: boolean;
};

const SOURCES: Source[] = [
  {
    name: "anthropic",
    url: "https://platform.claude.com/docs/en/about-claude/pricing.md",
    file: "anthropic-pricing.md",
    kind: "official",
  },
  {
    name: "openai",
    url: "https://developers.openai.com/api/docs/pricing.md",
    file: "openai-pricing.md",
    kind: "official",
  },
  {
    name: "google",
    url: "https://ai.google.dev/gemini-api/docs/pricing?hl=en",
    file: "google-pricing.2026-10-18.html",
    kind: "official",
    assertEnglishHtml: true,
  },
  {
    name: "models.dev",
    url: "https://models.dev/api.json",
    file: "models-dev-api.json",
    kind: "signal",
  },
];

const FIXTURES_DIR = path.join(process.cwd(), "tests", "fixtures");

function countPrices(text: string): number {
  return (text.match(/\$\s?\d+(\.\d+)?/g) ?? []).length;
}

async function spike(source: Source): Promise<void> {
  console.log(`\n== ${source.name} (${source.kind}) ==`);

  const headers: Record<string, string> = {
    "User-Agent": "PriceTrail-spike/0.1 (personal research project)",
  };
  if (source.assertEnglishHtml) {
    headers["Accept-Language"] = "en";
  }

  const res = await fetch(source.url, { headers });
  const body = await res.text();

  if (source.assertEnglishHtml) {
    assertHtmlLang(body, "en");
  }

  console.log("status:", res.status);
  console.log("size (KB):", Math.round(body.length / 1024));
  console.log("dollar amounts found:", countPrices(body));
  console.log("looks like a markdown table:", /^\|.*\|\s*$/m.test(body));

  await mkdir(FIXTURES_DIR, { recursive: true });
  await writeFile(path.join(FIXTURES_DIR, source.file), body, "utf8");
  console.log("saved:", source.file);
}

async function main(): Promise<void> {
  const filter = process.argv[2];
  const sources = filter
    ? SOURCES.filter((source) => source.name === filter)
    : SOURCES;

  if (filter && sources.length === 0) {
    throw new Error(
      `unknown source "${filter}". known: ${SOURCES.map((s) => s.name).join(", ")}`,
    );
  }

  for (const source of sources) {
    await spike(source);
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
