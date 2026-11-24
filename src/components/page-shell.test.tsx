import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { HeaderViewer } from "@/core/auth/header-viewer";
import { FinalCtaSection } from "@/components/landing-page/final-cta-section";
import { PageShell } from "@/components/page-shell";
import { SiteFooterFallback } from "@/components/site-footer";
import { SiteHeader, SiteHeaderFallback } from "@/components/site-header";

const pathname = vi.hoisted(() => ({ current: "/" }));
const guest: HeaderViewer = { role: "guest" };
const member: HeaderViewer = { role: "member", label: "ada@example.com" };

function matchMediaStub(matches: boolean): typeof window.matchMedia {
  return ((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent() {
      return false;
    },
  })) as typeof window.matchMedia;
}

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
    expect(within(footer).getByRole("link", { name: "How it works" }).getAttribute("href")).toBe(
      "/docs",
    );
    const howItWorks = screen.getAllByRole("link", { name: "How it works" }).filter(
      (link) => !footer.contains(link),
    );
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

    expect(
      within(screen.getByRole("contentinfo")).getByRole("link", { name: "How it works" }).getAttribute("href"),
    ).toBe("/docs");
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
    expect(screen.getByRole("link", { name: "Labs" }).getAttribute("href")).toBe("/labs");
    expect(screen.getByRole("link", { name: "Labs" }).getAttribute("aria-current")).toBeNull();

    expect(screen.getByRole("link", { name: "Receipts" }).getAttribute("aria-current")).toBeNull();
    expect(screen.queryByRole("link", { name: "How it works" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Honest by design" })).toBeNull();
  });

  it("shows the signed-in links, search, and account menu", () => {
    pathname.current = "/following";
    render(<SiteHeader viewer={member} />);

    const home = screen.getAllByRole("link", { name: "PriceTrail home" });
    expect(home.length).toBeGreaterThan(0);
    for (const link of home) {
      expect(link.getAttribute("href")).toBe("/following");
    }
    expect(document.querySelector(".signed-rail")).toBeTruthy();
    expect(screen.queryByRole("banner")).toBeNull();
    expect(screen.queryByRole("heading", { name: "AI model pricing, with receipts." })).toBeNull();
    const following = screen.getByRole("link", { name: "Following" });
    expect(following.getAttribute("href")).toBe("/following");
    expect(following.getAttribute("aria-current")).toBe("page");
    expect(following.className).toContain("bg-primary/10");
    expect(screen.getByRole("link", { name: "Models" }).className).not.toContain("bg-primary/10");
    expect(screen.getByRole("link", { name: "Labs" }).getAttribute("href")).toBe("/labs");
    const alerts = screen.getByRole("link", { name: "Alerts" });
    expect(alerts.getAttribute("href")).toBe("/alerts");
    expect(screen.getByRole("button", { name: "Search pages" })).toBeTruthy();
    expect(screen.getByText("Member").className).toContain("bg-primary");
    expect(screen.queryByRole("link", { name: "Create account" })).toBeNull();
    expect(screen.queryByRole("link", { name: "How it works" })).toBeNull();
    expect(screen.getByText("ada@example.com")).toBeTruthy();
    expect(screen.getByText("Member")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Theme:/ })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Account" }));

    expect(screen.getByText("ada@example.com")).toBeTruthy();
    expect(screen.getByText("Member")).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Theme:/ })).toBeTruthy();
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

  it("finds a page from the rail and hides the rail from the keyboard", () => {
    pathname.current = "/following";
    const { rerender } = render(<SiteHeader viewer={member} />);
    const previousMatchMedia = window.matchMedia;

    fireEvent.click(screen.getByRole("button", { name: "Search pages" }));
    const dialog = screen.getByRole("dialog", { name: "Search pages" });
    expect(within(dialog).queryByRole("link", { name: "Queue" })).toBeNull();
    fireEvent.change(within(dialog).getByRole("textbox", { name: "Search pages" }), {
      target: { value: "receipt" },
    });
    expect(within(dialog).getByRole("link", { name: "Receipts" }).getAttribute("href")).toBe(
      "/receipts",
    );
    expect(within(dialog).queryByRole("link", { name: "Following" })).toBeNull();
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Search pages" })).toBeNull();

    window.matchMedia = matchMediaStub(false);
    try {
      fireEvent.keyDown(window, { key: "b", ctrlKey: true });
      expect(screen.getByRole("navigation", { name: "Mobile" })).toBeTruthy();
      fireEvent.keyDown(window, { key: "b", ctrlKey: true });
      expect(screen.queryByRole("navigation", { name: "Mobile" })).toBeNull();

      window.matchMedia = matchMediaStub(true);
      fireEvent.keyDown(window, { key: "k", ctrlKey: true });
      expect(screen.getByRole("dialog", { name: "Search pages" })).toBeTruthy();
      fireEvent.keyDown(window, { key: "b", metaKey: true });
      expect(document.querySelector(".signed-rail")?.className).toContain("rail-closed");

      pathname.current = "/models";
      rerender(<SiteHeader viewer={member} />);
      expect(document.querySelector(".signed-rail")?.className).toContain("rail-closed");
      expect(screen.queryByRole("dialog", { name: "Search pages" })).toBeNull();
      expect(screen.getByRole("link", { name: "Following" })).toBeTruthy();
      expect(screen.getByRole("link", { name: "Models" })).toBeTruthy();
      expect(screen.getByRole("button", { name: "Search pages" })).toBeTruthy();

      fireEvent.keyDown(window, { key: "b", ctrlKey: true });
      expect(document.querySelector(".signed-rail")?.className).not.toContain("rail-closed");
    } finally {
      window.matchMedia = previousMatchMedia;
    }
  });

  it("opens the signed-in menu without the marketing links", () => {
    render(<SiteHeader viewer={member} />);

    expect(screen.queryByRole("navigation", { name: "Mobile" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Open menu" }));

    const mobile = screen.getByRole("navigation", { name: "Mobile" });
    expect(mobile.textContent).toContain("Following");
    expect(mobile.textContent).toContain("Models");
    expect(mobile.textContent).not.toContain("Create account");
    expect(mobile.textContent).not.toContain("How it works");
    expect(mobile.textContent).not.toContain("AI model pricing, with receipts.");
  });

  it("adds Review and the review links for a reviewer, and hides an empty count", () => {
    pathname.current = "/review/sources";
    const { rerender } = render(
      <SiteHeader viewer={{ role: "reviewer", label: "you@example.com", waiting: 0 }} />,
    );

    const review = screen.getByRole("link", { name: "Review" });
    expect(review.getAttribute("href")).toBe("/review");
    expect(review.getAttribute("aria-current")).toBe("page");
    expect(review.textContent).toBe("Review");
    expect(review.className).toContain("bg-primary/10");
    expect(screen.getByText("you@example.com")).toBeTruthy();
    expect(screen.getByText("Reviewer").className).toContain("bg-primary");
    expect(screen.queryByText("Member")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Search pages" }));
    const pages = screen.getByRole("dialog", { name: "Search pages" });
    expect(within(pages).getByRole("link", { name: "Queue" }).getAttribute("href")).toBe("/review");
    expect(within(pages).getByRole("link", { name: "Price reports" }).getAttribute("href")).toBe(
      "/review/reports",
    );
    fireEvent.keyDown(pages, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Search pages" })).toBeNull();

    const tabs = screen.getByRole("navigation", { name: "Review" });
    expect(tabs.className).toContain("border-l");
    expect(tabs.textContent).toContain("Queue");
    expect(tabs.textContent).toContain("Sources");
    expect(tabs.textContent).toContain("Signals");
    expect(tabs.textContent).toContain("Requests");
    expect(tabs.textContent).toContain("Price reports");
    expect(screen.getByRole("link", { name: "Sources" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: "Requests" }).textContent).toBe("Requests");

    pathname.current = "/models";
    rerender(<SiteHeader viewer={{ role: "reviewer", label: "you@example.com", waiting: 3 }} />);

    const counted = screen.getByRole("link", { name: /^Review/ });
    expect(counted.getAttribute("aria-current")).toBeNull();
    expect(counted.textContent?.replace(/\s+/g, "")).toBe("Review3");
    expect(screen.getByRole("navigation", { name: "Review" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Sources" }).getAttribute("aria-current")).toBeNull();
    expect(screen.queryByRole("heading", { name: "AI model pricing, with receipts." })).toBeNull();
  });
});

describe("SiteFooterFallback", () => {
  it("shows the links that stay on every page and hides the landing sections", () => {
    render(<SiteFooterFallback />);

    const footer = screen.getByRole("contentinfo");
    expect(footer.textContent).toContain("not affiliated with OpenAI, Anthropic, or Google");
    expect(screen.getByRole("link", { name: "Receipts" }).getAttribute("href")).toBe("/receipts");
    expect(screen.getByRole("link", { name: "How it works" }).getAttribute("href")).toBe("/docs");
    expect(screen.queryByRole("link", { name: "Honest by design" })).toBeNull();
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
