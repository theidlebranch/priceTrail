// @vitest-environment node

/**
 * These tests talk to Neon. They skip when DATABASE_URL is missing, which
 * is what CI does. Each database test rolls its transaction back, so a
 * passing run leaves no rows.
 *
 * Local run:
 * node --env-file=.env ./node_modules/vitest/vitest.mjs run src/server/db/repositories/accounts.test.ts
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createDb } from "@/server/db/client";
import { listAccounts, recordAccountSignIn, type AccountDb } from "@/server/db/repositories/accounts";
import { accounts } from "@/server/db/schema";
import { parseDatabaseEnv } from "@/server/env";

const databaseUrl = process.env.DATABASE_URL?.trim() ?? "";
const WHEN = new Date("2026-11-26T16:04:00.000Z");
const LATER = new Date("2026-11-26T18:15:00.000Z");

describe.skipIf(databaseUrl.length === 0)("accounts", () => {
  let close: (() => Promise<void>) | undefined;
  let db: ReturnType<typeof createDb>["db"];

  beforeAll(() => {
    const parsed = parseDatabaseEnv({ DATABASE_URL: databaseUrl });
    const opened = createDb(parsed.databaseUrl);
    db = opened.db;
    close = () => opened.close();
  });

  afterAll(async () => {
    await close?.();
  });

  it("keeps the first registration time and refreshes the later sign-in", async () => {
    await withRollback(async (tx) => {
      await recordAccountSignIn(tx, {
        provider: "google",
        providerAccountId: "acct-test-ada",
        name: "Ada",
        email: "ada@example.com",
        signedInAt: WHEN,
      });
      await recordAccountSignIn(tx, {
        provider: "github",
        providerAccountId: "424242",
        name: "  ",
        email: null,
        signedInAt: LATER,
      });
      await recordAccountSignIn(tx, {
        provider: "google",
        providerAccountId: "acct-test-ada",
        name: "Ada Lovelace",
        email: "ada.lovelace@example.com",
        signedInAt: LATER,
      });

      const listed = await listAccounts(tx);
      const ada = listed.find((row) => row.accountId === "google:acct-test-ada");
      const gh = listed.find((row) => row.accountId === "github:424242");
      expect(ada).toMatchObject({
        displayName: "Ada Lovelace",
        email: "ada.lovelace@example.com",
        registeredAt: WHEN,
        lastSignedInAt: LATER,
      });
      expect(gh).toMatchObject({
        displayName: null,
        email: null,
        registeredAt: LATER,
        lastSignedInAt: LATER,
      });
      expect(listed[0]?.accountId).toBe("github:424242");
      expect(listed.findIndex((row) => row.accountId === "google:acct-test-ada")).toBeGreaterThan(0);

      const stored = await tx
        .select({ registeredAt: accounts.registeredAt })
        .from(accounts)
        .where(eq(accounts.accountId, "google:acct-test-ada"));
      expect(stored).toEqual([{ registeredAt: WHEN }]);
    });
  });

  async function withRollback(run: (tx: AccountDb) => Promise<void>): Promise<void> {
    try {
      await db.transaction(async (tx) => {
        await run(tx);
        throw new RolledBack();
      });
    } catch (error) {
      if (error instanceof RolledBack) {
        return;
      }
      throw error;
    }
  }
});

class RolledBack extends Error {
  constructor() {
    super("account test rolled back");
    this.name = "RolledBack";
  }
}
