import { describe, expect, it } from "vitest";
import { assertHtmlLang } from "./assert-html-lang";

describe("assertHtmlLang", () => {
  it("accepts lang=\"en\"", () => {
    expect(() =>
      assertHtmlLang('<html lang="en"><body></body></html>', "en"),
    ).not.toThrow();
  });

  it("accepts a regional English tag like en-US", () => {
    expect(() =>
      assertHtmlLang('<html lang="en-US"><body></body></html>', "en"),
    ).not.toThrow();
  });

  it("throws when lang is a different language", () => {
    expect(() =>
      assertHtmlLang('<html lang="zh"><body></body></html>', "en"),
    ).toThrow(/html lang/i);
  });

  it("throws when lang is missing", () => {
    expect(() =>
      assertHtmlLang("<html><body></body></html>", "en"),
    ).toThrow(/html lang/i);
  });

  it("does not treat hreflang=\"en\" as the page language", () => {
    const html = `<html lang="zh">
      <head><link rel="alternate" hreflang="en" href="https://example.com/" /></head>
      <body></body>
    </html>`;
    expect(() => assertHtmlLang(html, "en")).toThrow(/html lang/i);
  });
});
