import { describe, expect, it } from "vitest";
import { assertSelectOne } from "@/server/db/ping";

describe("assertSelectOne", () => {
  it("accepts a numeric 1", () => {
    expect(assertSelectOne([{ ok: 1 }])).toBe(1);
  });

  it("accepts a string 1 from the driver", () => {
    expect(assertSelectOne([{ ok: "1" }])).toBe(1);
  });

  it("throws when there are no rows", () => {
    expect(() => assertSelectOne([])).toThrow(/no rows/);
  });

  it("throws when the value is not 1", () => {
    expect(() => assertSelectOne([{ ok: 2 }])).toThrow(/did not return 1/);
  });

  it("throws when the result is not a list of rows", () => {
    expect(() => assertSelectOne({ ok: 1 })).toThrow(/no rows/);
  });
});
