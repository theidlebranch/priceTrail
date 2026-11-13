import { describe, expect, it } from "vitest";
import { headerViewer, type HeaderAuthSession } from "./header-viewer";

const google = { reviewer: { provider: "google", accountId: "123" } };
const allow = new Set(["google:123"]);

function view(overrides: {
  secretConfigured?: boolean;
  session?: HeaderAuthSession;
  allowlist?: ReadonlySet<string>;
  waiting?: number | null;
}) {
  return headerViewer({
    secretConfigured: true,
    session: google,
    allowlist: new Set(),
    waiting: null,
    ...overrides,
  });
}

describe("headerViewer", () => {
  it("stays a guest when sign-in is not configured or the cookie is missing", () => {
    expect(view({ secretConfigured: false, session: google, allowlist: allow })).toEqual({
      role: "guest",
    });
    expect(view({ session: null })).toEqual({ role: "guest" });
  });

  it("stays a guest when the cookie has a name and no account id", () => {
    expect(view({ session: { user: { name: "Ada", email: "ada@example.com" } } })).toEqual({
      role: "guest",
    });
  });

  it("treats a signed-in account that is not on the list as a member", () => {
    expect(
      view({
        session: {
          user: { email: "ada@example.com", name: "Ada" },
          reviewer: { provider: "github", accountId: "42" },
        },
        allowlist: allow,
        waiting: 4,
      }),
    ).toEqual({ role: "member", label: "ada@example.com" });
  });

  it("uses the display name, then Signed in, when the email is missing", () => {
    expect(
      view({
        session: { user: { name: "Ada" }, reviewer: { provider: "github", accountId: "42" } },
      }),
    ).toEqual({ role: "member", label: "Ada" });
    expect(
      view({
        session: { reviewer: { provider: "github", accountId: "42" } },
      }),
    ).toEqual({ role: "member", label: "Signed in" });
  });

  it("marks an allowlisted account as a reviewer and keeps the waiting count", () => {
    expect(
      view({
        session: { user: { email: "you@example.com" }, ...google },
        allowlist: allow,
        waiting: 3,
      }),
    ).toEqual({ role: "reviewer", label: "you@example.com", waiting: 3 });
    expect(view({ allowlist: allow, waiting: 0 })).toEqual({
      role: "reviewer",
      label: "Signed in",
      waiting: 0,
    });
    expect(view({ allowlist: allow, waiting: null })).toEqual({
      role: "reviewer",
      label: "Signed in",
      waiting: null,
    });
  });

  it("throws when a reviewer waiting count is not a whole number", () => {
    expect(() => view({ allowlist: allow, waiting: -1 })).toThrow(/whole number/);
    expect(() => view({ allowlist: allow, waiting: 1.5 })).toThrow(/whole number/);
  });
});
