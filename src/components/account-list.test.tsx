import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AccountList } from "@/components/account-list";

afterEach(() => {
  cleanup();
});

describe("AccountList", () => {
  it("lists a name, an email, and both times", () => {
    render(
      <AccountList
        entries={[
          {
            accountId: "google:123",
            name: "Ada Lovelace",
            email: "ada@example.com",
            lastSignedIn: "Nov 26 · 18:15 UTC",
            registered: "Nov 26 · 16:04 UTC",
          },
          {
            accountId: "github:42",
            name: "No name",
            email: "No email",
            lastSignedIn: "Nov 26 · 18:15 UTC",
            registered: "Nov 26 · 18:15 UTC",
          },
        ]}
      />,
    );

    expect(screen.getByRole("heading", { name: "Accounts" })).toBeTruthy();
    expect(screen.getByText("2 accounts")).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "Name" })).toBeTruthy();
    expect(screen.getByRole("cell", { name: "Ada Lovelace" })).toBeTruthy();
    expect(screen.getByRole("cell", { name: "ada@example.com" })).toBeTruthy();
    expect(screen.getByRole("cell", { name: "No name" })).toBeTruthy();
    expect(screen.getByRole("cell", { name: "No email" })).toBeTruthy();
    expect(screen.getAllByRole("cell", { name: "Nov 26 · 18:15 UTC" })).toHaveLength(3);
    expect(screen.getByRole("cell", { name: "Nov 26 · 16:04 UTC" })).toBeTruthy();
  });

  it("says nobody is stored yet", () => {
    render(<AccountList entries={[]} />);

    expect(screen.getByText("0 accounts")).toBeTruthy();
    expect(
      screen.getByText("No accounts are stored yet. A person appears here the next time they sign in."),
    ).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
  });
});
