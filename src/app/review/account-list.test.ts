import { describe, expect, it } from "vitest";
import { accountCountLabel, toAccountListEntries } from "@/app/review/account-list";
import type { StoredAccount } from "@/server/db/repositories/accounts";

const WHEN = new Date("2026-11-26T16:04:00.000Z");
const LATER = new Date("2026-11-26T18:15:00.000Z");

describe("toAccountListEntries", () => {
  it("says when a name or an email was not sent", () => {
    const rows: StoredAccount[] = [
      {
        accountId: "google:123",
        displayName: "Ada Lovelace",
        email: "ada@example.com",
        registeredAt: WHEN,
        lastSignedInAt: LATER,
      },
      {
        accountId: "github:42",
        displayName: null,
        email: null,
        registeredAt: LATER,
        lastSignedInAt: LATER,
      },
    ];

    expect(toAccountListEntries(rows)).toEqual([
      {
        accountId: "google:123",
        name: "Ada Lovelace",
        email: "ada@example.com",
        lastSignedIn: "Nov 26 · 18:15 UTC",
        registered: "Nov 26 · 16:04 UTC",
      },
      {
        accountId: "github:42",
        name: "No name",
        email: "No email",
        lastSignedIn: "Nov 26 · 18:15 UTC",
        registered: "Nov 26 · 18:15 UTC",
      },
    ]);
  });
});

describe("accountCountLabel", () => {
  it("uses the singular only for one account", () => {
    expect(accountCountLabel(0)).toBe("0 accounts");
    expect(accountCountLabel(1)).toBe("1 account");
    expect(accountCountLabel(2)).toBe("2 accounts");
  });
});
