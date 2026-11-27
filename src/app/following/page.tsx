import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { setFollowAction } from "@/app/follows/follow-action";
import { toFollowingEntries } from "@/app/following/following-entries";
import { FollowingList } from "@/components/following-list";
import { readSignedInAccountId } from "@/server/auth/signed-in-account";
import { createDb } from "@/server/db/client";
import { listFollows } from "@/server/db/repositories/follows";
import { parseDatabaseEnv } from "@/server/env";

export const metadata: Metadata = {
  title: "Following · PriceTrail",
};

/**
 * The signed-in home page. A guest sees a sign-in line and no rows.
 * The list sits in Suspense so this Next.js version can render it on
 * the request. connection() runs before the database opens, because the
 * postgres driver calls Math.random() while it starts.
 *
 * A missing database URL or a failed query throws. An empty list is only
 * a real empty result. This page does not call publishPriceVersion().
 */
export default function FollowingPage() {
  return (
    <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-10">
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading following…</p>}>
        <FollowingLoader />
      </Suspense>
    </section>
  );
}

async function FollowingLoader() {
  await connection();
  const accountId = await readSignedInAccountId();
  if (accountId == null) {
    return <FollowingList entries={[]} signedIn={false} action={setFollowAction} />;
  }

  const { databaseUrl } = parseDatabaseEnv(process.env);
  const { db, close } = createDb(databaseUrl);
  try {
    const rows = await listFollows(db, accountId);
    return <FollowingList entries={toFollowingEntries(rows)} signedIn action={setFollowAction} />;
  } finally {
    await close();
  }
}
