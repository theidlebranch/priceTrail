import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { FollowFormState } from "@/app/follows/follow-action";
import type { FollowingEntry } from "@/app/following/following-entries";
import { FollowingList } from "@/components/following-list";

afterEach(() => {
  cleanup();
});

const LAB: FollowingEntry = { id: 2, kind: "lab", name: "Anthropic", labSlug: "anthropic" };
const MODEL: FollowingEntry = {
  id: 1,
  kind: "model",
  name: "Claude Fable 5.1",
  labName: "Anthropic",
  labSlug: "anthropic",
  modelSlug: "claude-fable-5.1",
  href: "/models/anthropic/claude-fable-5.1",
  retired: true,
};

describe("FollowingList", () => {
  it("asks a guest to sign in and hides the tabs", () => {
    render(<FollowingList entries={[LAB, MODEL]} signedIn={false} action={unusedFollow} />);

    expect(screen.getByRole("link", { name: "Sign in" }).getAttribute("href")).toBe("/sign-in");
    expect(screen.queryByRole("tablist")).toBeNull();
    expect(screen.queryByText("Anthropic")).toBeNull();
    expect(screen.queryByText("Claude Fable 5.1")).toBeNull();
  });

  it("keeps labs and models on separate tabs", () => {
    render(<FollowingList entries={[LAB, MODEL]} signedIn action={unusedFollow} />);

    expect(screen.getByRole("tab", { name: "1 lab" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tabpanel").textContent).toContain("Anthropic");
    expect(screen.getByRole("tabpanel").textContent).not.toContain("Claude Fable 5.1");

    fireEvent.click(screen.getByRole("tab", { name: "1 model" }));

    expect(screen.getByRole("tab", { name: "1 model" }).getAttribute("aria-selected")).toBe("true");
    const panel = screen.getByRole("tabpanel");
    expect(panel.textContent).toContain("Claude Fable 5.1");
    expect(panel.textContent).toContain("Retired");
    expect(panel.textContent).not.toContain("Anthropic");
    expect(screen.getByRole("link", { name: "Claude Fable 5.1" }).getAttribute("href")).toBe(
      "/models/anthropic/claude-fable-5.1",
    );
  });

  it("opens Models when the only rows are models", () => {
    render(<FollowingList entries={[MODEL]} signedIn action={unusedFollow} />);

    expect(screen.getByRole("tab", { name: "Labs" }).getAttribute("aria-selected")).toBe("false");
    expect(screen.getByRole("tab", { name: "1 model" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tabpanel").textContent).toContain("Claude Fable 5.1");
  });

  it("gives an empty tab its own sentence", () => {
    render(<FollowingList entries={[]} signedIn action={unusedFollow} />);

    expect(screen.getByRole("tab", { name: "Labs" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByText("You are not following any labs yet.")).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: "Models" }));

    expect(screen.getByText("You are not following any models yet.")).toBeTruthy();
    expect(screen.queryByText("You are not following any labs yet.")).toBeNull();
  });
});

function unusedFollow(): Promise<FollowFormState> {
  return Promise.resolve(null);
}
