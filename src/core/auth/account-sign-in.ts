import { reviewerId } from "@/core/auth/review-access";

/**
 * The account row written on a Google or GitHub sign-in.
 *
 * The id is the provider plus that provider's stable account id.
 * A name or an email that is missing or only spaces is stored empty.
 * This file does not open a database.
 */

export type AccountSignIn = {
  accountId: string;
  displayName: string | null;
  email: string | null;
  signedInAt: Date;
};

export function accountSignInFromProvider(input: {
  provider: string;
  providerAccountId: string | null | undefined;
  name?: string | null;
  email?: string | null;
  signedInAt: Date;
}): AccountSignIn {
  if (!(input.signedInAt instanceof Date) || Number.isNaN(input.signedInAt.getTime())) {
    throw new Error("sign-in time is not a real date");
  }

  return {
    accountId: reviewerId(input.provider, input.providerAccountId ?? ""),
    displayName: filledText(input.name),
    email: filledText(input.email),
    signedInAt: input.signedInAt,
  };
}

function filledText(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}
