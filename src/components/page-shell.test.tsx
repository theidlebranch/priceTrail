import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FinalCtaSection } from "@/components/landing-page/final-cta-section";
import { PageShell } from "@/components/page-shell";
import { SiteHeader, SiteHeaderFallback } from "@/components/site-header";

const pathname = vi.hoisted(() => ({ current: "/" }));

vi.mock("next/navigation", () => ({
  usePathname: () => pathname.current,
}));

afterEach(() => {
  cleanup();
  pathname.current = "/";
});

describe("PageShell", () => {
  it("puts the page inside main, under the shared header and footer", () => {
    render(
      <PageShell>
        <p>Page body</p>
      </PageShell>,
    );

    const main = screen.getByRole("main");
    expect(main.contains(screen.getByText("Page body"))).toBe(true);
    expect(main.id).toBe("top");

    expect(screen.getByRole("link", { name: "PriceTrail home" }).getAttribute("href")).toBe(
      "/#top",
    );

    const browseLinks = screen.getAllByRole("link", { name: "Browse models" });
    expect(browseLinks).toHaveLength(1);
    expect(browseLinks[0]?.getAttribute("href")).toBe("/models");
    expect(browseLinks[0]?.getAttribute("aria-current")).toBeNull();

    const sectionLinks = screen.getAllByRole("link", { name: "Receipts" });
    expect(sectionLinks.length).toBeGreaterThan(0);
    for (const link of sectionLinks) {
      expect(link.getAttribute("href")).toBe("/#receipts");
      expect(link.getAttribute("aria-current")).toBeNull();
    }

    const footer = screen.getByRole("contentinfo");
    expect(footer.textContent).toContain(
      "not affiliated with OpenAI, Anthropic, or Google",
    );
    expect(footer.textContent).not.toContain("All prices shown on this page are examples.");
  });
});

describe("SiteHeader", () => {
  it("opens the mobile menu", () => {
    render(<SiteHeader />);

    expect(screen.queryByRole("navigation", { name: "Mobile" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Open menu" }));

    expect(screen.getByRole("navigation", { name: "Mobile" })).toBeTruthy();
  });

  it("marks Browse models current on the models list and a model page", () => {
    const { rerender } = render(<SiteHeader />);
    expect(screen.getByRole("link", { name: "Browse models" }).getAttribute("aria-current")).toBeNull();

    pathname.current = "/models";
    rerender(<SiteHeader />);
    expect(screen.getByRole("link", { name: "Browse models" }).getAttribute("aria-current")).toBe(
      "page",
    );

    pathname.current = "/models/anthropic/claude";
    rerender(<SiteHeader />);
    expect(screen.getByRole("link", { name: "Browse models" }).getAttribute("aria-current")).toBe(
      "page",
    );
    expect(screen.getByRole("link", { name: "Browse models" }).className).toContain("text-primary");

    for (const link of screen.getAllByRole("link", { name: "Receipts" })) {
      expect(link.getAttribute("aria-current")).toBeNull();
    }
  });
});

describe("SiteHeaderFallback", () => {
  it("renders the same links with none marked current", () => {
    render(<SiteHeaderFallback />);

    const browse = screen.getByRole("link", { name: "Browse models" });
    expect(browse.getAttribute("href")).toBe("/models");
    expect(browse.getAttribute("aria-current")).toBeNull();

    expect(screen.getByRole("link", { name: "Receipts" }).getAttribute("href")).toBe(
      "/#receipts",
    );
    expect(screen.getByRole("link", { name: "How it works" }).getAttribute("href")).toBe(
      "/#how-it-works",
    );
    expect(screen.getByRole("link", { name: "Honest by design" }).getAttribute("href")).toBe(
      "/#honest",
    );

    for (const link of screen.getAllByRole("link")) {
      expect(link.getAttribute("aria-current")).toBeNull();
    }

    expect(screen.queryByRole("navigation", { name: "Mobile" })).toBeNull();
    expect(screen.getByRole("button", { name: "Open menu" }).getAttribute("aria-expanded")).toBe(
      "false",
    );
  });
});

describe("FinalCtaSection", () => {
  it("keeps the example-data label on the landing page", () => {
    render(<FinalCtaSection />);

    expect(screen.getByText("All prices shown on this page are examples.")).toBeTruthy();
  });
});
