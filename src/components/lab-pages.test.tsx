import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { SuggestLabState } from "@/components/lab-list";
import { LabList } from "@/components/lab-list";
import { ContributionList } from "@/components/contribution-list";
import { LabRequestList, type DecideLabRequestState } from "@/components/lab-request-list";

afterEach(() => {
  cleanup();
});

describe("LabList", () => {
  it("lists labs and asks a guest to sign in", () => {
    render(
      <LabList
        entries={[
          { name: "Anthropic", slug: "anthropic", modelCountLabel: "2 models" },
          { name: "OpenAI", slug: "openai", modelCountLabel: "1 model" },
        ]}
        signedIn={false}
        action={unusedSuggest}
      />,
    );

    expect(screen.getByRole("heading", { name: "Labs" })).toBeTruthy();
    expect(screen.getByText("2 labs")).toBeTruthy();
    expect(screen.getByText("Anthropic")).toBeTruthy();
    expect(screen.getByText("2 models")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Sign in" }).getAttribute("href")).toBe("/sign-in");
    expect(screen.queryByRole("button", { name: "Suggest lab" })).toBeNull();
  });

  it("shows the suggest form when the visitor is signed in, and an empty catalog", () => {
    render(<LabList entries={[]} signedIn action={unusedSuggest} />);

    expect(screen.getByText("No labs are tracked yet.")).toBeTruthy();
    expect(screen.getByText("0 labs")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Suggest lab" })).toBeTruthy();
    expect(screen.getByRole("textbox", { name: "Lab name" })).toBeTruthy();
  });
});

describe("LabRequestList", () => {
  it("says the queue is empty", () => {
    render(<LabRequestList entries={[]} action={unusedDecision} />);

    expect(screen.getByRole("heading", { name: "Requests" })).toBeTruthy();
    expect(screen.getByText("No lab suggestions are waiting.")).toBeTruthy();
    expect(screen.getByText("0 waiting")).toBeTruthy();
  });

  it("offers accept and decline on a waiting name", () => {
    render(
      <LabRequestList
        entries={[
          {
            id: 4,
            labName: "Mistral",
            suggestedBy: "google:123",
            suggestedAtText: "Nov 22 · 15:04 UTC",
            statusLabel: "Waiting for a reviewer.",
            reviewNote: null,
          },
        ]}
        action={unusedDecision}
      />,
    );

    expect(screen.getByText("1 waiting")).toBeTruthy();
    expect(screen.getByText("Mistral")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Accept" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Decline" })).toBeTruthy();
    expect(screen.getByRole("textbox", { name: "Note for Mistral" })).toBeTruthy();
  });
});

describe("ContributionList", () => {
  it("asks a guest to sign in and hides rows", () => {
    render(<ContributionList entries={[]} signedIn={false} />);

    expect(screen.getByRole("link", { name: "Sign in" }).getAttribute("href")).toBe("/sign-in");
    expect(screen.queryByText("You have not suggested a lab.")).toBeNull();
  });

  it("shows one account's suggestion and says an accepted lab is not tracked", () => {
    render(
      <ContributionList
        signedIn
        entries={[
          {
            id: 4,
            labName: "Mistral",
            suggestedBy: "google:123",
            suggestedAtText: "Nov 22 · 15:04 UTC",
            statusLabel: "Accepted. This lab is not tracked yet.",
            reviewNote: "Worth a parser later.",
          },
        ]}
      />,
    );

    expect(screen.getByText("Mistral")).toBeTruthy();
    expect(screen.getByText("Accepted. This lab is not tracked yet.")).toBeTruthy();
    expect(screen.getByText("Worth a parser later.")).toBeTruthy();
  });
});

function unusedSuggest(): Promise<SuggestLabState> {
  return Promise.resolve(null);
}

function unusedDecision(): Promise<DecideLabRequestState> {
  return Promise.resolve(null);
}
