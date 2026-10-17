import { describe, it, expect } from "vitest";
import { cn } from "./utils";

describe("cn", () => {
  it("joins class names", () => {
    expect(cn("p-2", "text-sm")).toBe("p-2 text-sm");
  });

  it("lets the later Tailwind class win", () => {
    expect(cn("p-2", "p-4")).toBe("p-4");
  });

  it("ignores falsy values", () => {
    expect(cn("p-2", false && "hidden")).toBe("p-2");
  });
});
