"use client";

import { useEffect, useId, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, Menu, UserRound, X } from "lucide-react";
import type { HeaderViewer } from "@/core/auth/header-viewer";
import { isProtectedReviewPath } from "@/core/auth/review-access";
import { ThemeToggle } from "@/components/theme-toggle";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const guestPageLinks = [
  { label: "Models", href: "/models" },
  { label: "Receipts", href: "/receipts" },
];

const landingHowItWorks = { label: "How it works", href: "#how-it-works" };

const memberLinks = [
  { label: "Following", href: "/following" },
  { label: "Models", href: "/models" },
  { label: "Receipts", href: "/receipts" },
  { label: "Alerts", href: "/alerts" },
];

const reviewTabs = [
  { label: "Queue", href: "/review" },
  { label: "Sources", href: "/review/sources" },
  { label: "Signals", href: "/review/signals" },
  { label: "Requests", href: "/review/requests" },
  { label: "Price reports", href: "/review/reports" },
];

const accountLinks = [
  { label: "Following", href: "/following" },
  { label: "Alerts and channels", href: "/alerts" },
  { label: "Contributions", href: "/contributions" },
  { label: "Account settings", href: "/account" },
];

type HeaderLink = { label: string; href: string };

/**
 * The bar visitors see. The server passes who they are. This file only
 * draws that. The fallback passes a guest and an empty path, so no link
 * is current and the menu button does nothing until the real bar replaces it.
 */
function SiteHeaderBar({
  viewer,
  pathname,
  menuOpen,
  accountOpen,
  signOut,
  onToggleMenu,
  onToggleAccount,
  onNavigate,
}: {
  viewer: HeaderViewer;
  pathname: string;
  menuOpen: boolean;
  accountOpen: boolean;
  signOut?: () => Promise<void>;
  onToggleMenu?: () => void;
  onToggleAccount?: () => void;
  onNavigate?: () => void;
}) {
  const signedIn = viewer.role !== "guest";
  const links = linksFor(viewer, pathname);
  const reviewOpen = viewer.role === "reviewer" && isProtectedReviewPath(pathname);
  const home = signedIn ? "/following" : "/";
  const accountMenuId = useId();

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-card">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4 sm:px-6 lg:px-10">
        <Logo href={home} />
        <nav aria-label="Primary" className="hidden items-center gap-5 lg:flex">
          {links.map((link) => (
            <NavLink key={link.href} link={link} pathname={pathname} />
          ))}
          {viewer.role === "reviewer" ? (
            <ReviewLink pathname={pathname} waiting={viewer.waiting} />
          ) : null}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          {signedIn ? <ModelSearch className="hidden lg:block" inputId="header-search" /> : null}
          <ThemeToggle />
          {signedIn ? (
            <>
              <Link
                href="/alerts"
                aria-label="Alerts"
                className={buttonVariants({ variant: "ghost", size: "icon" })}
              >
                <Bell />
              </Link>
              <AccountMenu
                label={viewer.label}
                roleLine={viewer.role === "reviewer" ? "Reviewer" : "Member"}
                open={accountOpen}
                menuId={accountMenuId}
                signOut={signOut}
                onToggle={onToggleAccount}
                onNavigate={onNavigate}
              />
            </>
          ) : (
            <>
              <Link
                href="/sign-in"
                className={cn(buttonVariants({ variant: "ghost" }), "hidden lg:inline-flex")}
              >
                Sign in
              </Link>
              <Link href="/sign-in" className={buttonVariants()}>
                Create account
              </Link>
            </>
          )}
          <button
            type="button"
            className={cn(buttonVariants({ variant: "outline", size: "icon" }), "lg:hidden")}
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            aria-controls="mobile-nav"
            onClick={onToggleMenu}
          >
            {menuOpen ? <X /> : <Menu />}
          </button>
        </div>
      </div>

      {reviewOpen ? <ReviewTabs pathname={pathname} /> : null}

      {menuOpen ? (
        <nav
          id="mobile-nav"
          aria-label="Mobile"
          className="flex flex-col gap-1 border-t border-border px-4 py-3 lg:hidden"
        >
          {links.map((link) => (
            <NavLink key={link.href} link={link} pathname={pathname} mobile onClick={onNavigate} />
          ))}
          {viewer.role === "reviewer" ? (
            <ReviewLink pathname={pathname} waiting={viewer.waiting} mobile onClick={onNavigate} />
          ) : null}
          {signedIn ? (
            <ModelSearch className="mt-2" inputId="header-search-mobile" />
          ) : (
            <Link
              href="/sign-in"
              onClick={onNavigate}
              className="rounded-md px-2 py-2 text-sm text-foreground hover:bg-muted"
            >
              Sign in
            </Link>
          )}
        </nav>
      ) : null}
    </header>
  );
}

export function SiteHeader({
  viewer,
  signOut,
}: {
  viewer: HeaderViewer;
  signOut?: () => Promise<void>;
}) {
  const pathname = usePathname() ?? "";
  return (
    <SiteHeaderControls key={pathname} viewer={viewer} signOut={signOut} pathname={pathname} />
  );
}

function SiteHeaderControls({
  viewer,
  signOut,
  pathname,
}: {
  viewer: HeaderViewer;
  signOut?: () => Promise<void>;
  pathname: string;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);

  useEffect(() => {
    if (viewer.role === "guest") {
      return;
    }
    function onKey(event: KeyboardEvent) {
      if (event.key !== "k" && event.key !== "K") {
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)
      ) {
        return;
      }
      const desktop = document.getElementById("header-search");
      if (desktop instanceof HTMLInputElement && desktop.offsetParent !== null) {
        event.preventDefault();
        desktop.focus();
        return;
      }
      event.preventDefault();
      setMenuOpen(true);
      window.requestAnimationFrame(() => {
        const mobile = document.getElementById("header-search-mobile");
        if (mobile instanceof HTMLInputElement) {
          mobile.focus();
        }
      });
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [viewer.role]);

  return (
    <SiteHeaderBar
      viewer={viewer}
      pathname={pathname}
      menuOpen={menuOpen}
      accountOpen={accountOpen}
      signOut={signOut}
      onToggleMenu={() => setMenuOpen((open) => !open)}
      onToggleAccount={() => setAccountOpen((open) => !open)}
      onNavigate={() => {
        setMenuOpen(false);
        setAccountOpen(false);
      }}
    />
  );
}

export function SiteHeaderFallback() {
  return (
    <SiteHeaderBar
      viewer={{ role: "guest" }}
      pathname=""
      menuOpen={false}
      accountOpen={false}
    />
  );
}

function Logo({ href }: { href: string }) {
  return (
    <Link href={href} aria-label="PriceTrail home" className="flex shrink-0 items-center gap-2">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 32 32"
        fill="none"
        width="32"
        height="32"
        className="h-7 w-7 shrink-0"
        aria-hidden="true"
      >
        <rect width="32" height="32" rx="7" fill="#0F766E" />
        <circle cx="17.5" cy="13" r="5.5" stroke="#FFFFFF" strokeWidth="2.5" />
        <path d="M12 13V23" stroke="#FFFFFF" strokeWidth="2.5" strokeLinecap="round" />
        <circle cx="12" cy="25.5" r="2.25" fill="#9CF2E8" />
      </svg>
      <span className="text-sm font-semibold tracking-tight">PriceTrail</span>
    </Link>
  );
}

function NavLink({
  link,
  pathname,
  mobile = false,
  onClick,
}: {
  link: HeaderLink;
  pathname: string;
  mobile?: boolean;
  onClick?: () => void;
}) {
  const active = linkIsCurrent(link.href, pathname);
  return (
    <Link
      href={link.href}
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={navClass(active, mobile)}
    >
      {link.label}
    </Link>
  );
}

function ReviewLink({
  pathname,
  waiting,
  mobile = false,
  onClick,
}: {
  pathname: string;
  waiting: number | null;
  mobile?: boolean;
  onClick?: () => void;
}) {
  const active = isProtectedReviewPath(pathname);
  const showCount = waiting !== null && waiting > 0;
  return (
    <Link
      href="/review"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={cn(navClass(active, mobile), "inline-flex items-center gap-1.5")}
    >
      Review
      {showCount ? (
        <span className="rounded-full border border-border px-1.5 text-xs tabular-nums text-foreground">
          {waiting}
        </span>
      ) : null}
    </Link>
  );
}

function ReviewTabs({ pathname }: { pathname: string }) {
  return (
    <nav aria-label="Review" className="border-t border-border">
      <div className="mx-auto flex max-w-7xl flex-wrap gap-x-5 gap-y-2 px-4 py-2.5 sm:px-6 lg:px-10">
        {reviewTabs.map((tab) => {
          const active = reviewTabIsCurrent(tab.href, pathname);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className={
                active
                  ? "text-sm font-medium text-foreground"
                  : "text-sm text-muted-foreground hover:text-foreground"
              }
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

function ModelSearch({ className, inputId }: { className?: string; inputId: string }) {
  return (
    <form action="/models" className={cn("relative", className)}>
      <input
        id={inputId}
        name="q"
        type="search"
        placeholder="Search models"
        aria-label="Search models"
        autoComplete="off"
        className="h-8 w-full rounded-lg border border-input bg-transparent pr-8 pl-2.5 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 lg:w-40"
      />
      <kbd
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 right-1.5 hidden -translate-y-1/2 rounded border border-border px-1 text-[10px] text-muted-foreground lg:inline"
      >
        K
      </kbd>
    </form>
  );
}

function linksFor(viewer: HeaderViewer, pathname: string): HeaderLink[] {
  if (viewer.role !== "guest") {
    return memberLinks;
  }
  if (pathname === "/") {
    return [...guestPageLinks, landingHowItWorks];
  }
  return guestPageLinks;
}

function AccountMenu({
  label,
  roleLine,
  open,
  menuId,
  signOut,
  onToggle,
  onNavigate,
}: {
  label: string;
  roleLine: string;
  open: boolean;
  menuId: string;
  signOut?: () => Promise<void>;
  onToggle?: () => void;
  onNavigate?: () => void;
}) {
  useEffect(() => {
    if (!open) {
      return;
    }
    function onPointer(event: MouseEvent) {
      const menu = document.getElementById(menuId);
      const button = document.getElementById(`${menuId}-button`);
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }
      if (menu?.contains(target) || button?.contains(target)) {
        return;
      }
      onToggle?.();
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onToggle?.();
      }
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuId, onToggle, open]);

  return (
    <div className="relative">
      <button
        id={`${menuId}-button`}
        type="button"
        className={buttonVariants({ variant: "outline", size: "icon" })}
        aria-label="Account"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={onToggle}
      >
        <UserRound />
      </button>
      {open ? (
        <div
          id={menuId}
          className="absolute right-0 z-50 mt-2 w-56 rounded-lg border border-border bg-card py-1"
        >
          <div className="border-b border-border px-3 py-2">
            <p className="truncate text-sm text-foreground">{label}</p>
            <p className="text-xs text-muted-foreground">{roleLine}</p>
          </div>
          <nav aria-label="Account" className="flex flex-col py-1">
            {accountLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={onNavigate}
                className="px-3 py-2 text-sm text-foreground hover:bg-muted"
              >
                {link.label}
              </Link>
            ))}
          </nav>
          <form action={signOut ?? noSignOut} className="border-t border-border">
            <button
              type="submit"
              className="w-full px-3 py-2 text-left text-sm text-foreground hover:bg-muted"
            >
              Sign out
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}

function noSignOut(): Promise<void> {
  return Promise.resolve();
}

function navClass(active: boolean, mobile: boolean): string {
  if (mobile) {
    return active
      ? "rounded-md px-2 py-2 text-sm text-primary hover:bg-muted"
      : "rounded-md px-2 py-2 text-sm text-foreground hover:bg-muted";
  }
  return active
    ? "py-1 text-sm text-primary"
    : "py-1 text-sm text-muted-foreground hover:text-foreground";
}

function linkIsCurrent(href: string, pathname: string): boolean {
  if (href.startsWith("#") || href.startsWith("/#") || pathname.length === 0) {
    return false;
  }
  if (href === "/models") {
    return pathname === "/models" || pathname.startsWith("/models/");
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

function reviewTabIsCurrent(href: string, pathname: string): boolean {
  if (href === "/review") {
    return pathname === "/review" || pathname.startsWith("/review/items");
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}
