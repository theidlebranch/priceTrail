import { connection } from "next/server";
import { headerViewer, type HeaderViewer } from "@/core/auth/header-viewer";
import { readAllowlistForHeader, reviewAuthSecretConfigured } from "@/core/auth/review-access";
import { createDb } from "@/server/db/client";
import { countFlaggedReviewItems } from "@/server/db/repositories/review-queue";
import { parseDatabaseEnv } from "@/server/env";

/**
 * Read the cookie for the public header.
 *
 * A missing AUTH_SECRET returns a guest and does not load the login
 * library, same as the review proxy. When the secret is set, connection()
 * runs before Auth.js. Auth.js reads the cookie with crypto, and Next.js
 * refuses to prerender that. A reviewer also asks how many official items
 * are still flagged. If that count fails, the Review link stays and the
 * number is left off, so a count problem does not take down the rest of
 * the site. A broken allowlist does the same for the header: the visitor
 * stays a member and Review stays hidden. /review still parses the list
 * itself and stays closed.
 */
export async function readHeaderViewer(): Promise<HeaderViewer> {
  if (!reviewAuthSecretConfigured(process.env)) {
    return { role: "guest" };
  }

  await connection();
  const { auth } = await import("@/server/auth/auth");
  const session = await auth();
  if (session == null) {
    return { role: "guest" };
  }

  const allowlistRead = readAllowlistForHeader(process.env.REVIEWER_ALLOWLIST);
  if (!allowlistRead.ok) {
    console.error("Reviewer allowlist could not be read. The header will not show Review.");
  }
  const allowlist = allowlistRead.allowlist;
  const viewer = headerViewer({
    secretConfigured: true,
    session,
    allowlist,
    waiting: null,
  });
  if (viewer.role !== "reviewer") {
    return viewer;
  }

  return headerViewer({
    secretConfigured: true,
    session,
    allowlist,
    waiting: await readWaitingCount(),
  });
}

async function readWaitingCount(): Promise<number | null> {
  try {
    const { databaseUrl } = parseDatabaseEnv(process.env);
    const { db, close } = createDb(databaseUrl);
    try {
      return await countFlaggedReviewItems(db);
    } finally {
      await close();
    }
  } catch {
    console.error("Review waiting count failed.");
    return null;
  }
}
