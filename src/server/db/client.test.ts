import { describe, expect, it } from "vitest";
import { connectionOptions } from "@/server/db/client";

describe("connectionOptions", () => {
  it("requires SSL when the URL says sslmode=require", () => {
    expect(
      connectionOptions(
        "postgresql://price_trail:secret@example.neon.tech/price_trail?sslmode=require",
      ),
    ).toEqual({ max: 1, ssl: "require" });
  });

  it("does not turn SSL on for a URL that does not ask for it", () => {
    expect(
      connectionOptions("postgresql://price_trail:secret@localhost:5432/price_trail"),
    ).toEqual({ max: 1 });
  });

  it("throws when the URL cannot be parsed, instead of guessing SSL", () => {
    expect(() => connectionOptions("not a url")).toThrow();
  });
});
