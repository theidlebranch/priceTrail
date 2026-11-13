import { describe, expect, it } from "vitest";
import {
  assertCanStartReviewSignIn,
  configuredReviewProviders,
  isProtectedReviewPath,
  parseReviewerAllowlist,
  readAllowlistForHeader,
  reviewAuthSecretConfigured,
  reviewDecision,
  reviewHttpResult,
  reviewLock,
  reviewSessionFromAuthResult,
  reviewerFromToken,
  reviewerId,
  stampReviewerToken,
} from "./review-access";

/**
 * The review lock is a pure check. It does not read the environment,
 * open a database, or talk to Google or GitHub. The proxy calls it.
 * An empty list means nobody. A broken entry throws, so a typo cannot
 * quietly let a stranger in.
 */
describe("reviewerId", () => {
  it("joins the provider and the stable account id", () => {
    expect(reviewerId("google", "109876543210987654321")).toBe(
      "google:109876543210987654321",
    );
    expect(reviewerId("github", "42")).toBe("github:42");
  });

  it("throws when the provider is not Google or GitHub", () => {
    expect(() => reviewerId("facebook", "1")).toThrow(/provider/);
    expect(() => reviewerId("Google", "123")).toThrow(/provider/);
    expect(() => reviewerId("", "123")).toThrow(/provider/);
  });

  it("throws when the account id is missing", () => {
    expect(() => reviewerId("google", "")).toThrow(/account id/);
    expect(() => reviewerId("google", "   ")).toThrow(/account id/);
  });

  it("throws when a GitHub id is a login name instead of digits", () => {
    expect(() => reviewerId("github", "octocat")).toThrow(/account id/);
  });

  it("throws when the account id is an email", () => {
    expect(() => reviewerId("google", "person@example.com")).toThrow(/account id/);
  });

  it("throws when the account id contains a colon", () => {
    expect(() => reviewerId("google", "abc:def")).toThrow(/account id/);
  });
});

describe("parseReviewerAllowlist", () => {
  it("reads a comma-separated list of reviewer ids", () => {
    expect(parseReviewerAllowlist("google:123, github:42")).toEqual(
      new Set(["google:123", "github:42"]),
    );
  });

  it("treats a missing, empty, or blank list as nobody", () => {
    expect(parseReviewerAllowlist(undefined)).toEqual(new Set());
    expect(parseReviewerAllowlist(null)).toEqual(new Set());
    expect(parseReviewerAllowlist("")).toEqual(new Set());
    expect(parseReviewerAllowlist("   ")).toEqual(new Set());
  });

  it("keeps one copy when the same id is listed twice", () => {
    expect(parseReviewerAllowlist("google:123,google:123")).toEqual(new Set(["google:123"]));
  });

  it("throws when an entry has no colon", () => {
    expect(() => parseReviewerAllowlist("google")).toThrow(/allowlist/);
  });

  it("throws when the provider or the account id is empty", () => {
    expect(() => parseReviewerAllowlist("google:")).toThrow(/allowlist/);
    expect(() => parseReviewerAllowlist(":123")).toThrow(/allowlist/);
  });

  it("throws when the provider is unknown", () => {
    expect(() => parseReviewerAllowlist("facebook:1")).toThrow(/allowlist/);
  });

  it("throws when a GitHub entry is not a numeric id", () => {
    expect(() => parseReviewerAllowlist("github:octocat")).toThrow(/allowlist/);
  });

  it("throws when an entry is an email", () => {
    expect(() => parseReviewerAllowlist("google:person@example.com")).toThrow(/allowlist/);
  });

  it("throws on an empty slot between commas", () => {
    expect(() => parseReviewerAllowlist("google:123,,github:42")).toThrow(/allowlist/);
    expect(() => parseReviewerAllowlist("google:123,")).toThrow(/allowlist/);
  });
});

describe("readAllowlistForHeader", () => {
  it("keeps a readable list, including a blank list that means nobody", () => {
    expect(readAllowlistForHeader("google:123, github:42")).toEqual({
      ok: true,
      allowlist: new Set(["google:123", "github:42"]),
    });
    expect(readAllowlistForHeader("")).toEqual({ ok: true, allowlist: new Set() });
    expect(readAllowlistForHeader(undefined)).toEqual({ ok: true, allowlist: new Set() });
  });

  it("returns an empty list when the entry is broken, and does not throw", () => {
    expect(readAllowlistForHeader("google:123,")).toEqual({
      ok: false,
      allowlist: new Set(),
    });
  });
});

describe("isProtectedReviewPath", () => {
  it("locks /review and pages under it", () => {
    expect(isProtectedReviewPath("/review")).toBe(true);
    expect(isProtectedReviewPath("/review/")).toBe(true);
    expect(isProtectedReviewPath("/review/items/1")).toBe(true);
    expect(isProtectedReviewPath("/review/sources")).toBe(true);
  });

  it("leaves the sign-in page open so the redirect does not loop", () => {
    expect(isProtectedReviewPath("/review/sign-in")).toBe(false);
    expect(isProtectedReviewPath("/review/sign-in/")).toBe(false);
  });

  it("does not treat a longer word as the review page", () => {
    expect(isProtectedReviewPath("/reviewing")).toBe(false);
    expect(isProtectedReviewPath("/reviews")).toBe(false);
  });

  it("leaves the public site and the login callback alone", () => {
    expect(isProtectedReviewPath("/")).toBe(false);
    expect(isProtectedReviewPath("/models")).toBe(false);
    expect(isProtectedReviewPath("/models/anthropic/claude-fable-5.1")).toBe(false);
    expect(isProtectedReviewPath("/api/auth/callback/google")).toBe(false);
  });
});

describe("reviewDecision", () => {
  const allowlist = new Set(["google:123", "github:42"]);

  it("sends a visitor with no session to sign in", () => {
    expect(
      reviewDecision({
        pathname: "/review",
        session: null,
        allowlist,
      }),
    ).toBe("sign-in");
  });

  it("forbids a signed-in account that is not on the list", () => {
    expect(
      reviewDecision({
        pathname: "/review",
        session: { provider: "google", accountId: "999" },
        allowlist,
      }),
    ).toBe("forbidden");
  });

  it("forbids everyone when the list is empty", () => {
    expect(
      reviewDecision({
        pathname: "/review",
        session: { provider: "google", accountId: "123" },
        allowlist: new Set(),
      }),
    ).toBe("forbidden");
  });

  it("allows a listed Google or GitHub account", () => {
    expect(
      reviewDecision({
        pathname: "/review/",
        session: { provider: "google", accountId: "123" },
        allowlist,
      }),
    ).toBe("allowed");
    expect(
      reviewDecision({
        pathname: "/review/items/1",
        session: { provider: "github", accountId: "42" },
        allowlist,
      }),
    ).toBe("allowed");
  });

  it("does not treat a Google id as a GitHub id", () => {
    expect(
      reviewDecision({
        pathname: "/review",
        session: { provider: "github", accountId: "123" },
        allowlist,
      }),
    ).toBe("forbidden");
  });

  it("throws when a session has no account id", () => {
    expect(() =>
      reviewDecision({
        pathname: "/review",
        session: { provider: "google", accountId: "" },
        allowlist,
      }),
    ).toThrow(/account id/);
  });

  it("throws when a session names an unknown provider", () => {
    expect(() =>
      reviewDecision({
        pathname: "/review",
        session: { provider: "facebook", accountId: "1" },
        allowlist,
      }),
    ).toThrow(/provider/);
  });

  it("throws when asked to decide a path that is not the locked page", () => {
    expect(() =>
      reviewDecision({
        pathname: "/models",
        session: null,
        allowlist,
      }),
    ).toThrow(/review/);
  });
});

describe("stampReviewerToken", () => {
  it("stores the provider account id, not the email", () => {
    expect(
      stampReviewerToken(
        { email: "person@example.com", name: "Ada" },
        { provider: "google", providerAccountId: "123" },
      ),
    ).toEqual({
      email: "person@example.com",
      name: "Ada",
      reviewerProvider: "google",
      reviewerAccountId: "123",
    });
  });

  it("keeps a stamped token when a later call has no account", () => {
    const stamped = stampReviewerToken({}, { provider: "github", providerAccountId: "42" });

    expect(stampReviewerToken(stamped, null)).toEqual(stamped);
    expect(stampReviewerToken(stamped, undefined)).toEqual(stamped);
  });

  it("throws when the provider did not send an account id", () => {
    expect(() => stampReviewerToken({}, { provider: "google", providerAccountId: null })).toThrow(
      /account id/,
    );
    expect(() => stampReviewerToken({}, { provider: "google" })).toThrow(/account id/);
  });

  it("throws when a GitHub account id is a login name", () => {
    expect(() => stampReviewerToken({}, { provider: "github", providerAccountId: "octocat" })).toThrow(
      /account id/,
    );
  });
});

describe("reviewerFromToken", () => {
  it("reads the stamped provider and account id", () => {
    expect(
      reviewerFromToken({ reviewerProvider: "github", reviewerAccountId: "42" }),
    ).toEqual({ provider: "github", accountId: "42" });
  });

  it("throws when a token has a name but no account id", () => {
    expect(() => reviewerFromToken({ name: "Ada", email: "person@example.com" })).toThrow(
      /account id/,
    );
  });

  it("throws when the stamped id is an email", () => {
    expect(() =>
      reviewerFromToken({ reviewerProvider: "google", reviewerAccountId: "person@example.com" }),
    ).toThrow(/account id/);
  });
});

describe("reviewSessionFromAuthResult", () => {
  it("returns null when there is no session", () => {
    expect(reviewSessionFromAuthResult(null)).toBeNull();
  });

  it("returns the reviewer from a stamped session", () => {
    expect(
      reviewSessionFromAuthResult({
        reviewer: { provider: "google", accountId: "123" },
      }),
    ).toEqual({ provider: "google", accountId: "123" });
  });

  it("throws when the session has a name but no account id", () => {
    expect(() => reviewSessionFromAuthResult({ user: { name: "Ada" } })).toThrow(/account id/);
  });

  it("throws when the session account id is an email", () => {
    expect(() =>
      reviewSessionFromAuthResult({
        reviewer: { provider: "google", accountId: "person@example.com" },
      }),
    ).toThrow(/account id/);
  });
});

describe("review auth env", () => {
  it("treats a missing or blank secret as not configured", () => {
    expect(reviewAuthSecretConfigured({})).toBe(false);
    expect(reviewAuthSecretConfigured({ AUTH_SECRET: "   " })).toBe(false);
    expect(reviewAuthSecretConfigured({ AUTH_SECRET: "long-random-secret" })).toBe(true);
  });

  it("lists a provider only when both the id and the secret are set", () => {
    expect(
      configuredReviewProviders({
        AUTH_GOOGLE_ID: "google-client",
        AUTH_GOOGLE_SECRET: "google-secret",
        AUTH_GITHUB_ID: "github-client",
      }),
    ).toEqual(["google"]);
  });

  it("does not list a provider whose secret is blank", () => {
    expect(
      configuredReviewProviders({
        AUTH_GOOGLE_ID: "google-client",
        AUTH_GOOGLE_SECRET: "  ",
        AUTH_GITHUB_ID: "github-client",
        AUTH_GITHUB_SECRET: "github-secret",
      }),
    ).toEqual(["github"]);
  });

  it("lists neither provider when nothing is set", () => {
    expect(configuredReviewProviders({})).toEqual([]);
  });

  it("throws when sign-in starts without a secret", () => {
    expect(() => assertCanStartReviewSignIn("google", {})).toThrow(/AUTH_SECRET/);
  });

  it("throws when the provider is not Google or GitHub", () => {
    expect(() =>
      assertCanStartReviewSignIn("facebook", { AUTH_SECRET: "long-random-secret" }),
    ).toThrow(/provider/);
  });

  it("throws when that provider has no client id and secret", () => {
    const clientSecret = "google-client-secret";

    expect(() =>
      assertCanStartReviewSignIn("google", {
        AUTH_SECRET: "long-random-secret",
        AUTH_GOOGLE_ID: "google-client",
      }),
    ).toThrow(/not configured/);

    try {
      assertCanStartReviewSignIn("google", {
        AUTH_SECRET: "long-random-secret",
        AUTH_GOOGLE_SECRET: clientSecret,
      });
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).not.toContain(clientSecret);
    }
  });

  it("returns the provider when that sign-in is configured", () => {
    expect(
      assertCanStartReviewSignIn("github", {
        AUTH_SECRET: "long-random-secret",
        AUTH_GITHUB_ID: "github-client",
        AUTH_GITHUB_SECRET: "github-secret",
      }),
    ).toBe("github");
  });
});

describe("reviewLock", () => {
  const allowlist = new Set(["google:123"]);

  it("refuses a listed account when the auth secret is missing", () => {
    expect(
      reviewLock({
        pathname: "/review",
        secretConfigured: false,
        session: { provider: "google", accountId: "123" },
        allowlist,
      }),
    ).toBe("not-configured");
  });

  it("does not look at a broken session when the secret is missing", () => {
    expect(
      reviewLock({
        pathname: "/review",
        secretConfigured: false,
        session: { provider: "google", accountId: "" },
        allowlist,
      }),
    ).toBe("not-configured");
  });

  it("sends a visitor with no session to sign in when the secret is set", () => {
    expect(
      reviewLock({
        pathname: "/review",
        secretConfigured: true,
        session: null,
        allowlist,
      }),
    ).toBe("sign-in");
  });

  it("throws when asked about a public path", () => {
    expect(() =>
      reviewLock({
        pathname: "/",
        secretConfigured: false,
        session: null,
        allowlist,
      }),
    ).toThrow(/review/);
  });
});

describe("reviewHttpResult", () => {
  it("redirects a signed-out visitor to the sign-in page", () => {
    expect(reviewHttpResult("sign-in")).toEqual({
      type: "redirect",
      pathname: "/review/sign-in",
    });
  });

  it("answers 403 when the account is not on the list", () => {
    expect(reviewHttpResult("forbidden")).toEqual({
      type: "text",
      status: 403,
      body: "This account cannot review.",
    });
  });

  it("answers 403 when sign-in is not configured", () => {
    expect(reviewHttpResult("not-configured")).toEqual({
      type: "text",
      status: 403,
      body: "Review sign-in is not configured.",
    });
  });

  it("lets an allowed reviewer through", () => {
    expect(reviewHttpResult("allowed")).toEqual({ type: "next" });
  });
});
