import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { refusedReview, type DecideReviewFormState } from "@/app/review/decision-form";
import { ReviewDecisionFields } from "@/components/review-decision-fields";

afterEach(() => {
  cleanup();
});

function noteBox(): HTMLTextAreaElement {
  const box = screen.getByRole("textbox", { name: "Note" });
  if (!(box instanceof HTMLTextAreaElement)) {
    throw new Error("note box is not a textarea");
  }
  return box;
}

describe("ReviewDecisionFields", () => {
  it("puts the typed note back when the decision is refused twice", async () => {
    async function refuse(
      _previous: DecideReviewFormState,
      formData: FormData,
    ): Promise<DecideReviewFormState> {
      return refusedReview("an earlier flagged item is still waiting", formData);
    }

    render(<ReviewDecisionFields itemId={4} action={refuse} />);
    fireEvent.change(noteBox(), { target: { value: "Checked the table." } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));

    expect(await screen.findByText("an earlier flagged item is still waiting")).toBeTruthy();
    expect(noteBox().value).toBe("Checked the table.");

    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    expect(await screen.findByText("an earlier flagged item is still waiting")).toBeTruthy();
    expect(noteBox().value).toBe("Checked the table.");
  });
});
