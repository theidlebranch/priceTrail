import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EvidenceDb } from "@/server/db/repositories/evidence";
import {
  cronRequestAuthorized,
  officialSourceForLab,
  respondToSchedule,
} from "@/server/pipeline/scheduled-visit";
import type { ProviderSource } from "@/server/sources/provider-source";

const SECRET = "cron-secret-16ch";
const DATABASE_URL = "postgres://price_trail:secret@localhost:5432/price_trail";

describe("cronRequestAuthorized", () => {
  it("accepts the bearer token Vercel sends for CRON_SECRET", () => {
    expect(cronRequestAuthorized(`Bearer ${SECRET}`, SECRET)).toBe(true);
  });

  it("refuses a missing header, a wrong token, a short secret, and surrounding spaces", () => {
    expect(cronRequestAuthorized(null, SECRET)).toBe(false);
    expect(cronRequestAuthorized("Bearer other-secret-16", SECRET)).toBe(false);
    expect(cronRequestAuthorized(`Bearer ${"short"}`, "short")).toBe(false);
    expect(cronRequestAuthorized(`Bearer ${SECRET}`, ` ${SECRET}`)).toBe(false);
    expect(cronRequestAuthorized(`Bearer ${SECRET}`, undefined)).toBe(false);
  });
});

describe("officialSourceForLab", () => {
  it("returns the three official pages and nothing else", () => {
    expect(officialSourceForLab("anthropic")?.lab).toBe("anthropic");
    expect(officialSourceForLab("openai")?.url).toContain("openai.com");
    expect(officialSourceForLab("google")?.url).toContain("ai.google.dev");
    expect(officialSourceForLab("Anthropic")).toBeNull();
    expect(officialSourceForLab("")).toBeNull();
  });
});

describe("respondToSchedule", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does not open the database when the secret does not match", async () => {
    const openDb = vi.fn();
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const response = await respondToSchedule({
      lab: "anthropic",
      authorization: null,
      headers: new Headers({
        authorization: `Bearer ${SECRET}`,
        "ce-id": "schx_refused",
      }),
      env: { CRON_SECRET: SECRET, DATABASE_URL },
      openDb,
      runVisit: vi.fn(),
    });

    expect(response.status).toBe(401);
    expect(openDb).not.toHaveBeenCalled();
    expect(logSpy).not.toHaveBeenCalled();
    logSpy.mockRestore();
  });

  it("does not open the database for an unknown lab", async () => {
    const openDb = vi.fn();

    const response = await respondToSchedule({
      lab: "meta",
      authorization: `Bearer ${SECRET}`,
      env: { CRON_SECRET: SECRET, DATABASE_URL },
      openDb,
      runVisit: vi.fn(),
    });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "unknown lab" });
    expect(openDb).not.toHaveBeenCalled();
  });

  it("runs one visit and closes the database", async () => {
    const close = vi.fn(async () => {});
    const db = {} as EvidenceDb;
    const openDb = vi.fn(() => ({ db, close }));
    const runVisit = vi.fn(async (_db: EvidenceDb, source: ProviderSource) => {
      expect(source.lab).toBe("google");
      return { kind: "unchanged" as const };
    });

    const response = await respondToSchedule({
      lab: "google",
      authorization: `Bearer ${SECRET}`,
      env: { CRON_SECRET: SECRET, DATABASE_URL },
      openDb,
      runVisit,
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ kind: "unchanged" });
    expect(openDb).toHaveBeenCalledWith(DATABASE_URL);
    expect(close).toHaveBeenCalledOnce();
  });

  it("returns a changed page with a failed archive as 200", async () => {
    const response = await respondToSchedule({
      lab: "anthropic",
      authorization: `Bearer ${SECRET}`,
      env: { CRON_SECRET: SECRET, DATABASE_URL },
      openDb: () => ({ db: {} as EvidenceDb, close: async () => {} }),
      runVisit: async () => ({
        kind: "changed",
        observationId: 313,
        archive: { kind: "failed", reason: "fetch failed" },
      }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      kind: "changed",
      observationId: 313,
      archive: "failed",
      reason: "fetch failed",
    });
  });

  it("returns a filed failure as 200", async () => {
    const response = await respondToSchedule({
      lab: "openai",
      authorization: `Bearer ${SECRET}`,
      env: { CRON_SECRET: SECRET, DATABASE_URL },
      openDb: () => ({ db: {} as EvidenceDb, close: async () => {} }),
      runVisit: async () => ({ kind: "fetch_error", note: "download failed" }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ kind: "fetch_error", note: "download failed" });
  });

  it("logs one line with the outcome and leaves out the database URL and the secret", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const response = await respondToSchedule({
      lab: "google",
      authorization: `Bearer ${SECRET}`,
      headers: new Headers({
        authorization: `Bearer ${SECRET}`,
        "ce-vssschedulename": "verify-google",
        "ce-id": "schx_abc",
      }),
      env: { CRON_SECRET: SECRET, DATABASE_URL },
      openDb: () => ({ db: {} as EvidenceDb, close: async () => {} }),
      runVisit: async () => ({ kind: "unchanged" as const }),
    });

    expect(response.status).toBe(200);
    expect(logSpy).toHaveBeenCalledOnce();
    const line = String(logSpy.mock.calls[0]?.[0]);
    expect(JSON.parse(line)).toEqual({
      lab: "google",
      kind: "unchanged",
      schedule: "verify-google",
      executionId: "schx_abc",
    });
    expect(line).not.toContain(DATABASE_URL);
    expect(line).not.toContain(SECRET);
    logSpy.mockRestore();
  });

  it("leaves the schedule name and execution id out when those headers are missing", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await respondToSchedule({
      lab: "openai",
      authorization: `Bearer ${SECRET}`,
      env: { CRON_SECRET: SECRET, DATABASE_URL },
      openDb: () => ({ db: {} as EvidenceDb, close: async () => {} }),
      runVisit: async () => ({ kind: "fetch_error" as const, note: "download failed" }),
    });

    const line = String(logSpy.mock.calls[0]?.[0]);
    expect(JSON.parse(line)).toEqual({
      lab: "openai",
      kind: "fetch_error",
      note: "download failed",
    });
    expect(line).not.toContain(DATABASE_URL);
    expect(line).not.toContain(SECRET);
    logSpy.mockRestore();
  });

  it("logs a changed page with the archive result and the execution id", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await respondToSchedule({
      lab: "anthropic",
      authorization: `Bearer ${SECRET}`,
      headers: new Headers({ "ce-id": "schx_changed" }),
      env: { CRON_SECRET: SECRET, DATABASE_URL },
      openDb: () => ({ db: {} as EvidenceDb, close: async () => {} }),
      runVisit: async () => ({
        kind: "changed" as const,
        observationId: 313,
        archive: { kind: "failed" as const, reason: "fetch failed" },
      }),
    });

    const line = String(logSpy.mock.calls[0]?.[0]);
    expect(JSON.parse(line)).toEqual({
      lab: "anthropic",
      kind: "changed",
      observationId: 313,
      archive: "failed",
      reason: "fetch failed",
      executionId: "schx_changed",
    });
    expect(line).not.toContain(DATABASE_URL);
    expect(line).not.toContain(SECRET);
    logSpy.mockRestore();
  });

  it("returns 500 without the database URL when the visit throws", async () => {
    const close = vi.fn(async () => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await respondToSchedule({
      lab: "anthropic",
      authorization: `Bearer ${SECRET}`,
      env: { CRON_SECRET: SECRET, DATABASE_URL },
      openDb: () => ({ db: {} as EvidenceDb, close }),
      runVisit: async () => {
        throw new Error(`connect failed for ${DATABASE_URL}`);
      },
    });

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "verify failed" });
    expect(close).toHaveBeenCalledOnce();
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("[redacted]"));
    expect(errorSpy.mock.calls.join(" ")).not.toContain(DATABASE_URL);
    expect(errorSpy.mock.calls.join(" ")).not.toContain(SECRET);
    errorSpy.mockRestore();
  });
});
