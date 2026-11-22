import { connection } from "next/server";
import { reviewAuthSecretConfigured } from "@/core/auth/review-access";
import { signedInAccountId } from "@/core/auth/header-viewer";

/**
 * The account id on a public page, or null when the visitor is signed out.
 *
 * A missing AUTH_SECRET does not load the login library. A cookie with a
 * name and no stable account id is signed out. This does not check the
 * reviewer allowlist.
 */
export async function readSignedInAccountId(): Promise<string | null> {
  if (!reviewAuthSecretConfigured(process.env)) {
    return null;
  }

  await connection();
  const { auth } = await import("@/server/auth/auth");
  const session = await auth();
  return signedInAccountId(session);
}
