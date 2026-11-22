import { reviewSessionFromAuthResult, reviewerId } from "@/core/auth/review-access";

/**
 * Who the public header is for.
 *
 * Guest means signed out, or sign-in is not configured. Member means a
 * Google or GitHub cookie that is not on the reviewer list. Reviewer
 * means that same cookie is on the list. This does not open a database
 * and does not decide whether /review may render. The review lock still
 * does that. A cookie with a name and no stable account id stays a guest
 * here, so a bad cookie cannot take down the public pages.
 */

export type HeaderAuthSession = {
  user?: { email?: string | null; name?: string | null } | null;
  reviewer?: { provider?: string; accountId?: string } | null;
} | null;

export type HeaderViewer =
  | { role: "guest" }
  | { role: "member"; label: string }
  | { role: "reviewer"; label: string; waiting: number | null };

/**
 * Where the logo and the home URL send this person.
 *
 * A guest still gets the marketing page. A member or a reviewer already
 * has an account, so `/` would only repeat that page. Following is the
 * signed-in home, even while that page is still a placeholder.
 */
export function homeHref(role: HeaderViewer["role"]): "/" | "/following" {
  return role === "guest" ? "/" : "/following";
}

/**
 * Where a visit to `/` should finish.
 *
 * The proxy asks this before the page shell starts. A redirect after
 * that shell has already gone out cannot change the response, and
 * reading the cookie inside the page stops Next.js from prerendering
 * the marketing page. A missing secret, a missing cookie, or a cookie
 * with no account id stays on `/`. The allowlist and the waiting count
 * do not matter here: both a member and a reviewer go to Following.
 */
export function visitorHomePath(input: {
  secretConfigured: boolean;
  session: HeaderAuthSession;
}): "/" | "/following" {
  return homeHref(
    headerViewer({
      secretConfigured: input.secretConfigured,
      session: input.session,
      allowlist: new Set(),
      waiting: null,
    }).role,
  );
}

export function headerViewer(input: {
  secretConfigured: boolean;
  session: HeaderAuthSession;
  allowlist: ReadonlySet<string>;
  waiting: number | null;
}): HeaderViewer {
  if (!input.secretConfigured || input.session == null) {
    return { role: "guest" };
  }

  let account;
  try {
    account = reviewSessionFromAuthResult(input.session);
  } catch {
    return { role: "guest" };
  }
  if (account == null) {
    return { role: "guest" };
  }

  const label = accountLabel(input.session);
  if (!input.allowlist.has(reviewerId(account.provider, account.accountId))) {
    return { role: "member", label };
  }

  if (input.waiting !== null && (!Number.isInteger(input.waiting) || input.waiting < 0)) {
    throw new Error("Waiting count must be a whole number or empty.");
  }

  return { role: "reviewer", label, waiting: input.waiting };
}

/**
 * The account id for a signed-in visitor, or null when they are a guest.
 * A cookie with a name and no stable account id is a guest. Suggesting a
 * lab stores this id. It does not check the reviewer allowlist.
 */
export function signedInAccountId(session: HeaderAuthSession): string | null {
  try {
    const account = reviewSessionFromAuthResult(session);
    if (account == null) {
      return null;
    }
    return reviewerId(account.provider, account.accountId);
  } catch {
    return null;
  }
}

function accountLabel(session: HeaderAuthSession): string {
  const email = session?.user?.email?.trim() ?? "";
  if (email.length > 0) {
    return email;
  }
  const name = session?.user?.name?.trim() ?? "";
  if (name.length > 0) {
    return name;
  }
  return "Signed in";
}
