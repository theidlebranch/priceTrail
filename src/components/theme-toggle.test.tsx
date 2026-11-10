import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { THEME_STORAGE_KEY } from "@/components/theme";
import { ThemeToggle } from "@/components/theme-toggle";

afterEach(() => {
  cleanup();
  localStorage.removeItem(THEME_STORAGE_KEY);
  document.documentElement.classList.remove("dark");
  document.documentElement.style.colorScheme = "";
});

describe("ThemeToggle", () => {
  it("switches a dark page to light, then back to dark", () => {
    document.documentElement.classList.add("dark");

    render(<ThemeToggle />);

    fireEvent.click(screen.getByRole("button", { name: /Theme:/ }));

    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(document.documentElement.style.colorScheme).toBe("light");
    expect(screen.getByRole("button", { name: "Theme: light" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Theme: light" }));

    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(screen.getByRole("button", { name: "Theme: dark" })).toBeTruthy();
  });
});
