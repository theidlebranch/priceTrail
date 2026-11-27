import { beforeEach, describe, expect, it, vi } from "vitest";
import { setFollowAction } from "@/app/follows/follow-action";

const { refresh, followTarget, unfollowTarget } = vi.hoisted(() => ({
  refresh: vi.fn(),
  followTarget: vi.fn(),
  unfollowTarget: vi.fn(),
}));

vi.mock("next/cache", () => ({ refresh }));
vi.mock("@/server/auth/signed-in-account", () => ({
  readSignedInAccountId: async () => "google:follow-test",
}));
vi.mock("@/server/env", () => ({ parseDatabaseEnv: () => ({ databaseUrl: "unused" }) }));
vi.mock("@/server/db/client", () => ({ createDb: () => ({ db: {}, close: async () => {} }) }));
vi.mock("@/server/db/repositories/catalog", () => ({
  createCatalogRepository: () => ({ findLabBySlug: async () => ({ id: 1, name: "Anthropic" }) }),
}));
vi.mock("@/server/db/repositories/follows", () => ({ followTarget, unfollowTarget }));

describe("setFollowAction", () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([
    ["follow", "You already follow Anthropic."],
    ["unfollow", "You are not following Anthropic."],
  ])("refreshes when %s succeeds without changing a row", async (intent, title) => {
    followTarget.mockResolvedValue({ alreadyFollowed: true });
    unfollowTarget.mockResolvedValue({ removed: false });
    const data = new FormData();
    data.set("kind", "lab");
    data.set("intent", intent);
    data.set("labSlug", "anthropic");

    await expect(setFollowAction(null, data)).resolves.toEqual({ ok: true, title });
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
