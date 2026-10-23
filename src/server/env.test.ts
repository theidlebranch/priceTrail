import { describe, expect, it } from "vitest";
import { parseDatabaseEnv } from "@/server/env";

const VALID_URL = "postgresql://price_trail:secret@example.neon.tech/price_trail?sslmode=require";

describe("parseDatabaseEnv", () => {
  it("returns the database URL when it is a postgres URL", () => {
    expect(parseDatabaseEnv({ DATABASE_URL: VALID_URL })).toEqual({
      databaseUrl: VALID_URL,
    });
  });

  it("accepts the postgres:// scheme as well as postgresql://", () => {
    const databaseUrl = "postgres://price_trail:secret@localhost:5432/price_trail";

    expect(parseDatabaseEnv({ DATABASE_URL: databaseUrl })).toEqual({
      databaseUrl,
    });
  });

  it("accepts a postgres URL with more than one host and port", () => {
    const databaseUrl =
      "postgresql://price_trail:secret@host1:5432,host2:5433/price_trail?sslmode=require";

    expect(parseDatabaseEnv({ DATABASE_URL: databaseUrl })).toEqual({
      databaseUrl,
    });
  });

  it("throws when DATABASE_URL is missing", () => {
    expect(() => parseDatabaseEnv({})).toThrow(/DATABASE_URL/);
  });

  it("throws when DATABASE_URL is blank", () => {
    expect(() => parseDatabaseEnv({ DATABASE_URL: "   " })).toThrow(/DATABASE_URL/);
  });

  it("throws when a postgres URL has no host", () => {
    expect(() => parseDatabaseEnv({ DATABASE_URL: "postgresql:///price_trail" })).toThrow(
      /DATABASE_URL/,
    );
  });

  it("throws when DATABASE_URL is not a postgres URL, and does not repeat the value", () => {
    const databaseUrl = "https://example.com/not-a-database";

    expect(() => parseDatabaseEnv({ DATABASE_URL: databaseUrl })).toThrow(/DATABASE_URL/);

    try {
      parseDatabaseEnv({ DATABASE_URL: databaseUrl });
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).not.toContain(databaseUrl);
    }
  });
});
