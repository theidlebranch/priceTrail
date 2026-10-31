import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { FinalCtaSection } from "@/components/landing-page/final-cta-section";
import { PageShell } from "@/components/page-shell";
import { SiteHeader } from "@/components/site-header";

afterEach(() => {
  cleanup();
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
    expect(browseLinks.length).toBeGreaterThan(0);
    for (const link of browseLinks) {
      expect(link.getAttribute("href")).toBe("/models");
    }

    const sectionLinks = screen.getAllByRole("link", { name: "Receipts" });
    expect(sectionLinks.length).toBeGreaterThan(0);
    for (const link of sectionLinks) {
      expect(link.getAttribute("href")).toBe("/#receipts");
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
});

describe("FinalCtaSection", () => {
  it("keeps the example-data label on the landing page", () => {
    render(<FinalCtaSection />);

    expect(screen.getByText("All prices shown on this page are examples.")).toBeTruthy();
  });
});
