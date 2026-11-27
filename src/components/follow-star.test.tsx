import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { FollowFormState } from "@/app/follows/follow-action";
import { FollowStar } from "@/components/follow-star";
import { Toaster } from "@/components/ui/sonner";

afterEach(() => {
  cleanup();
});

describe("FollowStar", () => {
  it("asks a guest to sign in and does not toast", () => {
    render(
      <FollowStar
        name="Claude Fable 5.1"
        kind="model"
        followed={false}
        signedIn={false}
        labSlug="anthropic"
        modelSlug="claude-fable-5.1"
        action={unusedFollow}
      />,
    );

    const link = screen.getByRole("link", { name: "Sign in to follow Claude Fable 5.1" });
    expect(link.getAttribute("href")).toBe("/sign-in");
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("toasts after a follow and after an unfollow", async () => {
    const { rerender } = render(
      <>
        <Toaster />
        <FollowStar
          name="Claude Fable 5.1"
          kind="model"
          followed={false}
          signedIn
          labSlug="anthropic"
          modelSlug="claude-fable-5.1"
          action={followed}
        />
      </>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Follow Claude Fable 5.1" }));
    expect(await screen.findByText("Following Claude Fable 5.1.")).toBeTruthy();

    rerender(
      <>
        <Toaster />
        <FollowStar
          name="Claude Fable 5.1"
          kind="model"
          followed
          signedIn
          labSlug="anthropic"
          modelSlug="claude-fable-5.1"
          action={removed}
        />
      </>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Unfollow Claude Fable 5.1" }));
    expect(await screen.findByText("Claude Fable 5.1 removed.")).toBeTruthy();
  });
});

function unusedFollow(): Promise<FollowFormState> {
  return Promise.resolve(null);
}

function followed(): Promise<FollowFormState> {
  return Promise.resolve({
    ok: true,
    title: "Following Claude Fable 5.1.",
    description: "It is on your Following page.",
  });
}

function removed(): Promise<FollowFormState> {
  return Promise.resolve({
    ok: true,
    title: "Claude Fable 5.1 removed.",
    description: "It is no longer on your Following page.",
  });
}
