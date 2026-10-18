import * as cheerio from "cheerio";

/**
 * Check the document language on the <html> element.
 *
 * Searching the file for `lang="en"` is the wrong check: a Chinese page
 * can still have `hreflang="en"` on a <link>, and that would look like a
 * match. Cheerio reads the attribute on <html> only.
 */
export function assertHtmlLang(html: string, expected: string): void {
  const $ = cheerio.load(html);
  const lang = $("html").attr("lang")?.trim() ?? "";
  const prefix = expected.toLowerCase();
  const actual = lang.toLowerCase();
  const matches = actual === prefix || actual.startsWith(`${prefix}-`);

  if (!matches) {
    throw new Error(
      `html lang must start with "${expected}" (got ${lang ? JSON.stringify(lang) : "missing"})`,
    );
  }
}
