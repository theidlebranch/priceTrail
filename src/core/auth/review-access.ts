/**
 * Who may open /review.
 *
 * The id is the login provider plus that provider's stable account id.
 * An email or a display name is not an id: both can change, and two
 * people can share a name. An empty allowlist means nobody. A broken
 * entry throws, so a typo cannot quietly let a stranger in.
 *
 * This file does not read the environment, open a database, or call
 * Google or GitHub. The proxy passes the path, the session, and the list.
 */

type ReviewProvider = "google" | "github";

export type ReviewSession = {
  provider: string;
  accountId: string;
};

export type ReviewDecision = "sign-in" | "forbidden" | "allowed";

export type ReviewLock = ReviewDecision | "not-configured";

export type ReviewHttpResult =
  | { type: "redirect"; pathname: "/review/sign-in" }
  | { type: "text"; status: 403; body: string }
  | { type: "next" };

type ReviewAuthSession = {
  user?: { name?: string | null } | null;
  reviewer?: { provider?: string; accountId?: string } | null;
} | null;

export function reviewerId(provider: string, accountId: string): string {
  const known = knownProvider(provider);
  const id = accountId.trim();
  if (!isAccountId(known, id)) {
    throw new Error("Reviewer account id is missing or not a stable account id.");
  }
  return `${known}:${id}`;
}

export function parseReviewerAllowlist(value: string | null | undefined): ReadonlySet<string> {
  if (value == null || value.trim().length === 0) {
    return new Set();
  }

  const ids = new Set<string>();
  for (const entry of value.split(",")) {
    const trimmed = entry.trim();
    if (trimmed.length === 0) {
      throw new Error("Reviewer allowlist has an empty entry.");
    }
    const separator = trimmed.indexOf(":");
    if (separator <= 0 || separator === trimmed.length - 1) {
      throw new Error("Reviewer allowlist entry must be provider:accountId.");
    }
    try {
      ids.add(reviewerId(trimmed.slice(0, separator), trimmed.slice(separator + 1)));
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Reviewer allowlist entry is invalid. ${error.message}`);
      }
      throw error;
    }
  }
  return ids;
}

export function isProtectedReviewPath(pathname: string): boolean {
  const path = stripTrailingSlash(pathname);
  if (path === "/review/sign-in") {
    return false;
  }
  return path === "/review" || path.startsWith("/review/");
}

export function reviewDecision(input: {
  pathname: string;
  session: ReviewSession | null;
  allowlist: ReadonlySet<string>;
}): ReviewDecision {
  if (!isProtectedReviewPath(input.pathname)) {
    throw new Error("Review decision is only for a locked /review path.");
  }
  if (input.session === null) {
    return "sign-in";
  }

  const id = reviewerId(input.session.provider, input.session.accountId);
  if (!input.allowlist.has(id)) {
    return "forbidden";
  }
  return "allowed";
}

export function stampReviewerToken<T extends Record<string, unknown>>(
  token: T,
  account: { provider: string; providerAccountId?: string | null } | null | undefined,
): T {
  if (account == null) {
    return token;
  }
  const id = reviewerId(account.provider, account.providerAccountId ?? "");
  const separator = id.indexOf(":");
  return {
    ...token,
    reviewerProvider: id.slice(0, separator),
    reviewerAccountId: id.slice(separator + 1),
  };
}

export function reviewerFromToken(token: Record<string, unknown>): ReviewSession {
  if (typeof token.reviewerProvider !== "string" || typeof token.reviewerAccountId !== "string") {
    throw new Error("Review session is missing the provider account id.");
  }
  const id = reviewerId(token.reviewerProvider, token.reviewerAccountId);
  const separator = id.indexOf(":");
  return {
    provider: id.slice(0, separator),
    accountId: id.slice(separator + 1),
  };
}

export function reviewSessionFromAuthResult(session: ReviewAuthSession): ReviewSession | null {
  if (session == null) {
    return null;
  }
  if (session.reviewer == null) {
    throw new Error("Review session is missing the provider account id.");
  }
  return reviewerFromToken({
    reviewerProvider: session.reviewer.provider,
    reviewerAccountId: session.reviewer.accountId,
  });
}

export function assertCanStartReviewSignIn(
  provider: string,
  env: NodeJS.Dict<string>,
): ReviewProvider {
  if (!reviewAuthSecretConfigured(env)) {
    throw new Error("AUTH_SECRET is missing.");
  }
  const known = knownProvider(provider);
  if (!configuredReviewProviders(env).includes(known)) {
    throw new Error("Review sign-in provider is not configured.");
  }
  return known;
}

export function reviewPlaceholder(session: ReviewSession): string {
  return `You are signed in as ${reviewerId(session.provider, session.accountId)}. The review queue is not built yet.`;
}

export function reviewAuthSecretConfigured(env: NodeJS.Dict<string>): boolean {
  return (env.AUTH_SECRET ?? "").trim().length > 0;
}

export function configuredReviewProviders(env: NodeJS.Dict<string>): ReviewProvider[] {
  const providers: ReviewProvider[] = [];
  if (bothSet(env.AUTH_GOOGLE_ID, env.AUTH_GOOGLE_SECRET)) {
    providers.push("google");
  }
  if (bothSet(env.AUTH_GITHUB_ID, env.AUTH_GITHUB_SECRET)) {
    providers.push("github");
  }
  return providers;
}

export function reviewLock(input: {
  pathname: string;
  secretConfigured: boolean;
  session: ReviewSession | null;
  allowlist: ReadonlySet<string>;
}): ReviewLock {
  if (!isProtectedReviewPath(input.pathname)) {
    throw new Error("Review decision is only for a locked /review path.");
  }
  if (!input.secretConfigured) {
    return "not-configured";
  }
  return reviewDecision(input);
}

export function reviewHttpResult(lock: ReviewLock): ReviewHttpResult {
  if (lock === "sign-in") {
    return { type: "redirect", pathname: "/review/sign-in" };
  }
  if (lock === "forbidden") {
    return { type: "text", status: 403, body: "This account cannot review." };
  }
  if (lock === "not-configured") {
    return { type: "text", status: 403, body: "Review sign-in is not configured." };
  }
  return { type: "next" };
}

function bothSet(id: string | undefined, secret: string | undefined): boolean {
  return (id ?? "").trim().length > 0 && (secret ?? "").trim().length > 0;
}

function knownProvider(provider: string): ReviewProvider {
  if (provider === "google" || provider === "github") {
    return provider;
  }
  throw new Error("Reviewer provider must be google or github.");
}

function isAccountId(provider: ReviewProvider, accountId: string): boolean {
  if (accountId.length === 0 || accountId.includes("@") || accountId.includes(":")) {
    return false;
  }
  if (provider === "github") {
    return /^[0-9]+$/.test(accountId);
  }
  return /^[A-Za-z0-9_-]+$/.test(accountId);
}

function stripTrailingSlash(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith("/")) {
    return pathname.replace(/\/+$/, "");
  }
  return pathname;
}
