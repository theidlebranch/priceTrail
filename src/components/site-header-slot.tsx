import { SiteHeader } from "@/components/site-header";
import { readHeaderViewer } from "@/server/auth/header-session";

/**
 * The cookie is request data, so this sits inside Suspense. The fallback
 * is the guest bar. A slow read never flashes Review or Sign out.
 *
 * Sign out is loaded only after a real session. A missing AUTH_SECRET
 * stays a guest and does not load the login library.
 */
export async function SiteHeaderSlot() {
  const viewer = await readHeaderViewer();
  if (viewer.role === "guest") {
    return <SiteHeader viewer={viewer} />;
  }

  const { signOutAccount } = await import("@/server/auth/sign-in-reviewer");
  return <SiteHeader viewer={viewer} signOut={signOutAccount} />;
}
