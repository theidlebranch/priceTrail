import { describe, expect, it } from "vitest";
import {
  assertNoForbiddenPriceWrites,
  findForbiddenPriceWrites,
  listPriceWriteFiles,
} from "./price-write-guard";

/**
 * This file does not open a database. It checks source text.
 * A fake file is enough to prove the guard rejects a write, so the real
 * repo never needs a broken insert just to show the check can fail.
 */

const OTHER_FILE = "src/server/db/repositories/catalog.ts";
const PUBLISH_FILE = "src/server/db/publish-price-version.ts";
const TEST_FILE = "src/server/db/publish-price-version.test.ts";

function lineOf(source: string, snippet: string): number {
  const index = source.split("\n").findIndex((line) => line.includes(snippet));
  if (index === -1) {
    throw new Error(`test snippet is not in the source: ${snippet}`);
  }
  return index + 1;
}

function expectWriteRejected(path: string, source: string, snippet: string): void {
  expect(() => assertNoForbiddenPriceWrites([{ path, source }])).toThrow(
    `${path}:${String(lineOf(source, snippet))}: ${snippet}`,
  );
}

describe("price write guard", () => {
  it("throws when another file inserts a price version", () => {
    const source = "await db.insert(priceVersions).values({});";
    expectWriteRejected(OTHER_FILE, source, ".insert(priceVersions)");
  });

  it("throws when another file updates a price component", () => {
    const source = "await db.update(priceComponents).set({ amount: \"1\" });";
    expectWriteRejected(OTHER_FILE, source, ".update(priceComponents)");
  });

  it("throws when another file deletes a price version", () => {
    const source = [
      "const ready = true;",
      "await db.delete(priceVersions).where(eq(priceVersions.id, 1));",
    ].join("\n");
    expectWriteRejected(OTHER_FILE, source, ".delete(priceVersions)");
  });

  it("throws when another file inserts through the schema object", () => {
    const source = "await db.insert(schema.priceVersions).values({});";
    expectWriteRejected(OTHER_FILE, source, ".insert(schema.priceVersions)");
  });

  it("throws when SQL inserts into price_versions", () => {
    const source = "INSERT INTO price_versions (offering_id) VALUES (1);";
    expectWriteRejected("scripts/seed.sql", source, "INSERT INTO price_versions");
  });

  it("throws when SQL inserts into price_version_evidence", () => {
    const source = "INSERT INTO price_version_evidence (price_version_id) VALUES (1);";
    expectWriteRejected("scripts/seed.sql", source, "INSERT INTO price_version_evidence");
  });

  it("throws when SQL updates a quoted price_components table", () => {
    const source = 'UPDATE "price_components" SET amount = 1;';
    expectWriteRejected("scripts/seed.sql", source, 'UPDATE "price_components"');
  });

  it("throws when SQL deletes from price_versions", () => {
    const source = "DELETE FROM price_versions WHERE id = 1;";
    expectWriteRejected("scripts/seed.sql", source, "DELETE FROM price_versions");
  });

  it("allows the publish module to insert a price version", () => {
    expect(
      findForbiddenPriceWrites({
        path: PUBLISH_FILE,
        source: "await tx.insert(priceVersions).values({});",
      }),
    ).toEqual([]);
  });

  it("allows a test file to plant a price row", () => {
    expect(
      findForbiddenPriceWrites({
        path: TEST_FILE,
        source: "await tx.insert(priceVersions).values([]);",
      }),
    ).toEqual([]);
  });

  it("allows the table definition to name price_versions", () => {
    expect(
      findForbiddenPriceWrites({
        path: "src/server/db/schema.ts",
        source: 'export const priceVersions = pgTable("price_versions", {});',
      }),
    ).toEqual([]);
  });

  it("allows a select from the price tables", () => {
    expect(
      findForbiddenPriceWrites({
        path: OTHER_FILE,
        source: "const rows = await db.select().from(priceVersions);",
      }),
    ).toEqual([]);
  });

  it("allows a migration to create the table and declare foreign keys", () => {
    const source = [
      'CREATE TABLE "price_versions" (',
      '"id" bigint PRIMARY KEY',
      ");",
      'ALTER TABLE "price_components" ADD CONSTRAINT "price_components_price_version_id_price_versions_id_fk" FOREIGN KEY ("price_version_id") REFERENCES "public"."price_versions"("id") ON DELETE restrict ON UPDATE no action;',
    ].join("\n");

    expect(
      findForbiddenPriceWrites({
        path: "drizzle/0001_price_tables.sql",
        source,
      }),
    ).toEqual([]);
  });

  it("finds no forbidden price writes in this repo", () => {
    const files = listPriceWriteFiles(process.cwd());
    const paths = files.map((file) => file.path);

    expect(paths).toContain(PUBLISH_FILE);
    expect(paths.some((filePath) => filePath.endsWith(".test.ts"))).toBe(false);
    expect(() => assertNoForbiddenPriceWrites(files)).not.toThrow();
  });
});
