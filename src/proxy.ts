import { NextResponse, type NextRequest } from "next/server";
import { assertPublicSlug } from "@/app/models/model-list-entries";
import { parseReviewItemId } from "@/app/review/review-list";
import {
  isProtectedReviewPath,
  parseReviewerAllowlist,
  reviewAuthSecretConfigured,
  reviewHttpResult,
  reviewLock,
  type ReviewHttpResult,
} from "@/core/auth/review-access";
import { createDb } from "@/server/db/client";
import { hasTrackedModel } from "@/server/db/repositories/model-detail";
import { hasReviewItem } from "@/server/db/repositories/review-queue";
import { parseDatabaseEnv } from "@/server/env";

/**
 * Two checks run before a page shell starts.
 *
 * Unknown models must answer 404. With cache components on, the shell is
 * already sent as HTTP 200, so notFound() inside the loader cannot change
 * the status. This check is one slug lookup. The price read stays in the page.
 *
 * /review must answer before that shell too. A missing AUTH_SECRET is a
 * 403 and does not load the login library, so a review secret cannot take
 * down /models. When the secret is set, a signed-out visitor is redirected
 * to /review/sign-in. Any other account, including an empty allowlist, is
 * a 403. The login library is imported only for a locked /review path.
 *
 * The pathname keeps percent-encoding. The page receives decoded
 * params, so this lookup decodes each segment once before it checks
 * the slug or reads the database. A bad slug still throws. A database
 * error still throws. Neither becomes a 404. A tracked model with no
 * price continues to the page.
 *
 * A missing review item answers 404 the same way, and only after the
 * reviewer is allowed in. A stranger still gets 403, not a hint that
 * the id exists. An id that is not a whole number throws. /review
 * itself is not an item lookup.
 */
export async function proxy(request: NextRequest) {
  if (isProtectedReviewPath(request.nextUrl.pathname)) {
    const denied = await protectReview(request);
    if (denied !== null) {
      return denied;
    }
    return missingReviewItemResponse(request);
  }

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
      return notFoundResponse();
    }
  } finally {
    await close();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/models/:labSlug/:modelSlug", "/review", "/review/:path*"],
};

async function protectReview(request: NextRequest): Promise<NextResponse | null> {
  const secretConfigured = reviewAuthSecretConfigured(process.env);
  if (!secretConfigured) {
    return reviewTextResponse(reviewHttpResult("not-configured"));
  }

  const { readReviewSession } = await import("@/server/auth/review-session");
  const session = await readReviewSession();
  const lock = reviewLock({
    pathname: request.nextUrl.pathname,
    secretConfigured: true,
    session,
    allowlist: parseReviewerAllowlist(process.env.REVIEWER_ALLOWLIST),
  });
  const result = reviewHttpResult(lock);
  if (result.type === "next") {
    return null;
  }
  if (result.type === "redirect") {
    const url = request.nextUrl.clone();
    url.pathname = result.pathname;
    url.search = "";
    return NextResponse.redirect(url);
  }
  return reviewTextResponse(result);
}

async function missingReviewItemResponse(request: NextRequest): Promise<NextResponse> {
  const itemId = reviewItemId(request.nextUrl.pathname);
  if (itemId === null) {
    return NextResponse.next();
  }

  const { databaseUrl } = parseDatabaseEnv(process.env);
  const { db, close } = createDb(databaseUrl);

  try {
    const found = await hasReviewItem(db, itemId);
    if (!found) {
      return notFoundResponse();
    }
  } finally {
    await close();
  }

  return NextResponse.next();
}

function notFoundResponse(): NextResponse {
  return new NextResponse("This page could not be found.", {
    status: 404,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function reviewTextResponse(result: ReviewHttpResult) {
  if (result.type !== "text") {
    throw new Error("Review text response was given a redirect.");
  }
  return new NextResponse(result.body, {
    status: result.status,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

/**
 * /review/items/<id>, or null when this locked path is not an item.
 * The id check throws. A trailing slash is the same item.
 */
export function reviewItemId(pathname: string): number | null {
  const path = stripTrailingSlash(pathname);
  const parts = path.split("/");
  if (parts.length !== 4 || parts[1] !== "review" || parts[2] !== "items") {
    return null;
  }

  const segment = parts[3];
  if (segment === undefined || segment.length === 0) {
    return null;
  }

  return parseReviewItemId(decodeReviewSegment(segment));
}

function stripTrailingSlash(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith("/")) {
    return pathname.replace(/\/+$/, "");
  }
  return pathname;
}

function decodeReviewSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch (error) {
    if (error instanceof URIError) {
      throw new Error("Review item id is not a valid encoded path segment");
    }
    throw error;
  }
}

export function modelSlugs(pathname: string): { labSlug: string; modelSlug: string } | null {
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

  return {
    labSlug: decodeSlug(labSlug, "lab"),
    modelSlug: decodeSlug(modelSlug, "model"),
  };
}

function decodeSlug(segment: string, kind: "lab" | "model"): string {
  try {
    return decodeURIComponent(segment);
  } catch (error) {
    if (error instanceof URIError) {
      throw new Error(`${kind} slug is not a valid encoded path segment`);
    }
    throw error;
  }
}
