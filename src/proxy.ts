import { NextResponse, type NextRequest } from "next/server";
import { assertPublicSlug } from "@/app/models/model-list-entries";
import { createDb } from "@/server/db/client";
import { hasTrackedModel } from "@/server/db/repositories/model-detail";
import { parseDatabaseEnv } from "@/server/env";

/**
 * Unknown models must answer 404 before the page shell starts.
 *
 * The detail page reads the database inside Suspense. With cache
 * components on, that shell is already sent as HTTP 200, so notFound()
 * inside the loader cannot change the status. This check is one slug
 * lookup. The price read stays in the page.
 *
 * A bad slug still throws. A database error still throws. Neither
 * becomes a 404. A tracked model with no price continues to the page.
 */
export async function proxy(request: NextRequest) {
  const slugs = modelSlugs(request.nextUrl.pathname);
  if (slugs === null) {
    return NextResponse.next();
  }

  assertPublicSlug(slugs.labSlug, "lab");
  assertPublicSlug(slugs.modelSlug, "model");

  const { databaseUrl } = parseDatabaseEnv(process.env);
  const { db, close } = createDb(databaseUrl);

  try {
    const tracked = await hasTrackedModel(db, slugs.labSlug, slugs.modelSlug);
    if (!tracked) {
      return new NextResponse("This page could not be found.", {
        status: 404,
        headers: {
          "content-type": "text/plain; charset=utf-8",
          "cache-control": "no-store",
        },
      });
    }
  } finally {
    await close();
  }

  return NextResponse.next();
}

export const config = {
  matcher: "/models/:labSlug/:modelSlug",
};

function modelSlugs(pathname: string): { labSlug: string; modelSlug: string } | null {
  const parts = pathname.split("/");
  if (parts.length !== 4 || parts[1] !== "models") {
    return null;
  }

  const labSlug = parts[2];
  const modelSlug = parts[3];
  if (
    labSlug === undefined ||
    modelSlug === undefined ||
    labSlug.length === 0 ||
    modelSlug.length === 0
  ) {
    return null;
  }

  return { labSlug, modelSlug };
}
