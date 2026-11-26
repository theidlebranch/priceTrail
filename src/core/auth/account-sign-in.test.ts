import { describe, expect, it } from "vitest";
import { accountSignInFromProvider } from "@/core/auth/account-sign-in";

const WHEN = new Date("2026-11-26T16:04:00.000Z");

describe("accountSignInFromProvider", () => {
  it("keeps a Google name and email", () => {
    expect(
      accountSignInFromProvider({
        provider: "google",
        providerAccountId: "123",
        name: " Ada Lovelace ",
        email: " ada@example.com ",
        signedInAt: WHEN,
      }),
    ).toEqual({
      accountId: "google:123",
      displayName: "Ada Lovelace",
      email: "ada@example.com",
      signedInAt: WHEN,
    });
  });

  it("stores a blank name and a blank email as empty", () => {
    expect(
      accountSignInFromProvider({
        provider: "github",
        providerAccountId: "42",
        name: "   ",
        email: null,
        signedInAt: WHEN,
      }),
    ).toEqual({
      accountId: "github:42",
      displayName: null,
      email: null,
      signedInAt: WHEN,
    });
  });

  it("throws when the provider is not Google or GitHub", () => {
    expect(() =>
      accountSignInFromProvider({
        provider: "apple",
        providerAccountId: "123",
        signedInAt: WHEN,
      }),
    ).toThrow(/google or github/);
  });

  it("throws when a GitHub account id is a login name", () => {
    expect(() =>
      accountSignInFromProvider({
        provider: "github",
        providerAccountId: "octocat",
        signedInAt: WHEN,
      }),
    ).toThrow(/account id/);
  });

  it("throws when the sign-in time is not a real date", () => {
    expect(() =>
      accountSignInFromProvider({
        provider: "google",
        providerAccountId: "123",
        signedInAt: new Date("not-a-date"),
      }),
    ).toThrow(/sign-in time/);
  });
});
