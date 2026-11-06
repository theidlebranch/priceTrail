import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
import Google from "next-auth/providers/google";
import { configuredReviewProviders, stampReviewerToken } from "@/core/auth/review-access";

/**
 * Login for /review only.
 *
 * Auth.js is the library that talks to Google and GitHub and stores the
 * result in an encrypted cookie. We do not give it a database adapter, so
 * it does not create a user table. The cookie is the whole session.
 *
 * The default cookie only keeps a name, an email, and a picture. An email
 * can change, so the jwt callback copies the provider's stable account id
 * as well. The session callback puts that id where the review gate can
 * read it. A token that has a name and no account id is left without a
 * reviewer. The gate then throws instead of treating that cookie as
 * "please sign in".
 *
 * A provider is added only when both its client id and client secret are
 * set. A half-configured Google login must not take GitHub down with it.
 */

export const { handlers, auth, signIn, signOut } = NextAuth(() => {
  const configured = configuredReviewProviders(process.env);
  const providers = [];
  if (configured.includes("google")) {
    providers.push(Google);
  }
  if (configured.includes("github")) {
    providers.push(GitHub);
  }

  return {
    // Vercel and `next dev` set the host. Auth.js will not use it unless
    // we say so, and the callback URL would be wrong.
    trustHost: true,
    session: { strategy: "jwt" },
    providers,
    pages: {
      signIn: "/review/sign-in",
    },
    callbacks: {
      jwt({ token, account }) {
        return stampReviewerToken(token, account);
      },
      session({ session, token }) {
        // Copy the raw strings onto the session object. The gate checks
        // them and throws if they are not a real account id. Checking
        // here would let Auth.js turn that throw into "no session",
        // which looks like a sign-in redirect.
        // The cast only satisfies Session. The extra field stays on the
        // object Auth.js returns.
        if (
          typeof token.reviewerProvider === "string" &&
          typeof token.reviewerAccountId === "string"
        ) {
          return {
            ...session,
            reviewer: {
              provider: token.reviewerProvider,
              accountId: token.reviewerAccountId,
            },
          } as typeof session;
        }
        return session;
      },
    },
  };
});
