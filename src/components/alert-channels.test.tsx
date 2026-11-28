import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { AlertWebhookFormState } from "@/app/alerts/save-webhook-action";
import { AlertChannels } from "@/components/alert-channels";

afterEach(() => {
  cleanup();
});

describe("AlertChannels", () => {
  it("asks a guest to sign in and does not show a field that saves", () => {
    render(
      <AlertChannels signedIn={false} slackSaved={false} discordSaved={false} action={unusedAction} />,
    );

    expect(screen.getByRole("link", { name: "Sign in" }).getAttribute("href")).toBe("/sign-in");
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText(/only when a price you follow is published/)).toBeTruthy();
  });

  it("shows saved or not saved, and does not print a webhook URL", () => {
    render(
      <AlertChannels signedIn slackSaved discordSaved={false} action={unusedAction} />,
    );

    expect(screen.getByText("Slack is saved")).toBeTruthy();
    expect(screen.getByText("Discord is not saved")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Remove Slack" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Remove Discord" })).toBeNull();
    const fields = screen.getAllByRole("textbox");
    expect(fields).toHaveLength(2);
    for (const field of fields) {
      expect(field.getAttribute("value") ?? "").toBe("");
    }
    expect(document.body.textContent).not.toContain("secret-token");
    expect(document.body.textContent).not.toContain("hooks.slack.com/services");
  });
});

async function unusedAction(): Promise<AlertWebhookFormState> {
  return null;
}
