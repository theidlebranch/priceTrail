import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { HeaderViewer } from "@/core/auth/header-viewer";
import { FinalCtaSection } from "@/components/landing-page/final-cta-section";
import { PageShell } from "@/components/page-shell";
import { SiteHeader, SiteHeaderFallback } from "@/components/site-header";

const pathname = vi.hoisted(() => ({ current: "/" }));
const guest: HeaderViewer = { role: "guest" };
const member: HeaderViewer = { role: "member", label: "ada@example.com" };

vi.mock("next/navigation", () => ({
  usePathname: () => pathname.current,
}));

vi.mock("@/components/site-header-slot", async () => {
  const { createElement: create } = await import("react");
  const { SiteHeader: Header } = await import("@/components/site-header");
  return {
    SiteHeaderSlot: () => create(Header, { viewer: { role: "guest" } }),
  };
});

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

    expect(screen.getByRole("link", { name: "PriceTrail home" }).getAttribute("href")).toBe("/");

    const modelLinks = screen.getAllByRole("link", { name: "Models" });
    expect(modelLinks).toHaveLength(1);
    expect(modelLinks[0]?.getAttribute("href")).toBe("/models");
    expect(modelLinks[0]?.getAttribute("aria-current")).toBeNull();

    const sectionLinks = screen.getAllByRole("link", { name: "Receipts" });
    expect(sectionLinks.length).toBeGreaterThan(0);
    for (const link of sectionLinks) {
      expect(link.getAttribute("href")).toBe("/receipts");
      expect(link.getAttribute("aria-current")).toBeNull();
    }

    expect(screen.getByRole("link", { name: "Create account" }).getAttribute("href")).toBe(
      "/sign-in",
    );
    expect(screen.queryByRole("link", { name: "Following" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Review" })).toBeNull();

    const footer = screen.getByRole("contentinfo");
    expect(footer.textContent).toContain(
      "not affiliated with OpenAI, Anthropic, or Google",
    );
    const howItWorks = screen.getAllByRole("link", { name: "How it works" });
    expect(howItWorks.length).toBeGreaterThan(0);
    for (const link of howItWorks) {
      expect(link.getAttribute("href")).toBe("#how-it-works");
    }
    expect(screen.getByRole("link", { name: "Honest by design" }).getAttribute("href")).toBe(
      "#honest",
    );
    expect(footer.textContent).not.toContain("All prices shown on this page are examples.");
  });

  it("drops landing-section links once the visitor leaves the home page", () => {
    pathname.current = "/models";
    render(
      <PageShell>
        <p>Models</p>
      </PageShell>,
    );

    expect(screen.queryByRole("link", { name: "How it works" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Honest by design" })).toBeNull();
    const receipts = screen.getAllByRole("link", { name: "Receipts" });
    expect(receipts.length).toBeGreaterThan(0);
    for (const link of receipts) {
      expect(link.getAttribute("href")).toBe("/receipts");
    }
  });
});

describe("SiteHeader", () => {
  it("opens the mobile menu and keeps Create account outside it", () => {
    render(<SiteHeader viewer={guest} />);

    expect(screen.queryByRole("navigation", { name: "Mobile" })).toBeNull();
    expect(screen.getByRole("link", { name: "Create account" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Open menu" }));

    const mobile = screen.getByRole("navigation", { name: "Mobile" });
    expect(mobile.textContent).toContain("Sign in");
    expect(mobile.textContent).not.toContain("Create account");
  });

  it("marks Models current on the models list and a model page", () => {
    const { rerender } = render(<SiteHeader viewer={guest} />);
    expect(screen.getByRole("link", { name: "Models" }).getAttribute("aria-current")).toBeNull();

    pathname.current = "/models";
    rerender(<SiteHeader viewer={guest} />);
    expect(screen.getByRole("link", { name: "Models" }).getAttribute("aria-current")).toBe("page");

    pathname.current = "/models/anthropic/claude";
    rerender(<SiteHeader viewer={guest} />);
    expect(screen.getByRole("link", { name: "Models" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: "Models" }).className).toContain("text-primary");

    expect(screen.getByRole("link", { name: "Receipts" }).getAttribute("aria-current")).toBeNull();
    expect(screen.queryByRole("link", { name: "How it works" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Honest by design" })).toBeNull();
  });

  it("shows the signed-in links, search, and account menu", () => {
    render(<SiteHeader viewer={member} />);

    expect(screen.getByRole("link", { name: "PriceTrail home" }).getAttribute("href")).toBe(
      "/following",
    );
    expect(screen.getByRole("link", { name: "Following" }).getAttribute("href")).toBe("/following");
    const alertLinks = screen.getAllByRole("link", { name: "Alerts" });
    expect(alertLinks.length).toBeGreaterThan(0);
    for (const link of alertLinks) {
      expect(link.getAttribute("href")).toBe("/alerts");
    }
    expect(screen.getByRole("searchbox", { name: "Search models" }).getAttribute("name")).toBe("q");
    expect(screen.queryByRole("link", { name: "Create account" })).toBeNull();
    expect(screen.queryByRole("link", { name: "How it works" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Account" }));

    expect(screen.getByText("ada@example.com")).toBeTruthy();
    expect(screen.getByText("Member")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Alerts and channels" }).getAttribute("href")).toBe(
      "/alerts",
    );
    expect(screen.getByRole("link", { name: "Contributions" }).getAttribute("href")).toBe(
      "/contributions",
    );
    expect(screen.getByRole("link", { name: "Account settings" }).getAttribute("href")).toBe(
      "/account",
    );
    expect(screen.getByRole("button", { name: "Sign out" })).toBeTruthy();
  });

  it("adds Review and the second row for a reviewer, and hides an empty count", () => {
    pathname.current = "/review/sources";
    const { rerender } = render(
      <SiteHeader viewer={{ role: "reviewer", label: "you@example.com", waiting: 0 }} />,
    );

    const review = screen.getByRole("link", { name: "Review" });
    expect(review.getAttribute("href")).toBe("/review");
    expect(review.getAttribute("aria-current")).toBe("page");
    expect(review.textContent).toBe("Review");
    fireEvent.click(screen.getByRole("button", { name: "Account" }));
    expect(screen.getByText("Reviewer")).toBeTruthy();
    expect(screen.queryByText("Member")).toBeNull();

    const tabs = screen.getByRole("navigation", { name: "Review" });
    expect(tabs.textContent).toContain("Queue");
    expect(tabs.textContent).toContain("Sources");
    expect(tabs.textContent).toContain("Requests");
    expect(tabs.textContent).toContain("Price reports");
    expect(screen.getByRole("link", { name: "Sources" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: "Requests" }).textContent).toBe("Requests");

    pathname.current = "/models";
    rerender(<SiteHeader viewer={{ role: "reviewer", label: "you@example.com", waiting: 3 }} />);

    expect(screen.queryByRole("navigation", { name: "Review" })).toBeNull();
    const counted = screen.getByRole("link", { name: /^Review/ });
    expect(counted.textContent?.replace(/\s+/g, "")).toBe("Review3");
  });
});

describe("SiteHeaderFallback", () => {
  it("renders the signed-out links with none marked current", () => {
    render(<SiteHeaderFallback />);

    const models = screen.getByRole("link", { name: "Models" });
    expect(models.getAttribute("href")).toBe("/models");
    expect(models.getAttribute("aria-current")).toBeNull();

    expect(screen.getByRole("link", { name: "Receipts" }).getAttribute("href")).toBe("/receipts");
    expect(screen.queryByRole("link", { name: "How it works" })).toBeNull();
    expect(screen.getByRole("link", { name: "Create account" }).getAttribute("href")).toBe(
      "/sign-in",
    );
    expect(screen.queryByRole("link", { name: "Honest by design" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Following" })).toBeNull();

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
