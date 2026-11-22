"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell,
  Bookmark,
  Boxes,
  Building2,
  ClipboardList,
  Database,
  Flag,
  Inbox,
  ListTodo,
  Menu,
  PenLine,
  Radio,
  Receipt,
  Search,
  Settings,
  UserRound,
  X,
  type LucideIcon,
} from "lucide-react";
import { homeHref, type HeaderViewer } from "@/core/auth/header-viewer";
import { isProtectedReviewPath } from "@/core/auth/review-access";
import { ThemeToggle } from "@/components/theme-toggle";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const guestPageLinks = [
  { label: "Models", href: "/models" },
  { label: "Labs", href: "/labs" },
  { label: "Receipts", href: "/receipts" },
];

const landingHowItWorks = { label: "How it works", href: "#how-it-works" };

const memberLinks: RailLink[] = [
  { label: "Following", href: "/following", icon: Bookmark },
  { label: "Models", href: "/models", icon: Boxes },
  { label: "Labs", href: "/labs", icon: Building2 },
  { label: "Receipts", href: "/receipts", icon: Receipt },
  { label: "Alerts", href: "/alerts", icon: Bell },
];

const reviewTabs: RailLink[] = [
  { label: "Queue", href: "/review", icon: ListTodo },
  { label: "Sources", href: "/review/sources", icon: Database },
  { label: "Signals", href: "/review/signals", icon: Radio },
  { label: "Requests", href: "/review/requests", icon: Inbox },
  { label: "Price reports", href: "/review/reports", icon: Flag },
];

const accountLinks = [
  { label: "Following", href: "/following" },
  { label: "Alerts and channels", href: "/alerts" },
  { label: "Contributions", href: "/contributions" },
  { label: "Account settings", href: "/account" },
];

const accountPageLinks: RailLink[] = [
  { label: "Contributions", href: "/contributions", icon: PenLine },
  { label: "Account settings", href: "/account", icon: Settings },
];

type HeaderLink = { label: string; href: string };
type RailLink = HeaderLink & { icon: LucideIcon };
type SignedInViewer = Exclude<HeaderViewer, { role: "guest" }>;

function pagesFor(viewer: SignedInViewer): RailLink[] {
  const review = viewer.role === "reviewer" ? reviewTabs : [];
  return [...memberLinks, ...review, ...accountPageLinks];
}

function isWideScreen(): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia("(min-width: 64rem)").matches;
}

/**
 * The bar visitors see. The server passes who they are. This file only
 * draws that. A guest keeps the top bar. A member or a reviewer gets a
 * left rail instead, and the same links open in a menu on a phone.
 * The fallback passes a guest and an empty path, so no link is current
 * and the menu button does nothing until the real bar replaces it.
 */
function GuestHeaderBar({
  pathname,
  menuOpen,
  onToggleMenu,
  onNavigate,
}: {
  pathname: string;
  menuOpen: boolean;
  onToggleMenu?: () => void;
  onNavigate?: () => void;
}) {
  const links = guestLinks(pathname);

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-card">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4 sm:px-6 lg:px-10">
        <Logo href={homeHref("guest")} />
        <nav aria-label="Primary" className="hidden items-center gap-5 lg:flex">
          {links.map((link) => (
            <NavLink key={link.href} link={link} pathname={pathname} />
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle />
          <Link
            href="/sign-in"
            className={cn(buttonVariants({ variant: "ghost" }), "hidden lg:inline-flex")}
          >
            Sign in
          </Link>
          <Link href="/sign-in" className={buttonVariants()}>
            Create account
          </Link>
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

      {menuOpen ? (
        <nav
          id="mobile-nav"
          aria-label="Mobile"
          className="flex flex-col gap-1 border-t border-border px-4 py-3 lg:hidden"
        >
          {links.map((link) => (
            <NavLink key={link.href} link={link} pathname={pathname} mobile onClick={onNavigate} />
          ))}
          <Link
            href="/sign-in"
            onClick={onNavigate}
            className="rounded-md px-2 py-2 text-sm text-foreground hover:bg-muted"
          >
            Sign in
          </Link>
        </nav>
      ) : null}
    </header>
  );
}

function SignedInRail({
  viewer,
  pathname,
  menuOpen,
  accountOpen,
  railOpen,
  signOut,
  onToggleMenu,
  onToggleAccount,
  onOpenPalette,
  onNavigate,
}: {
  viewer: SignedInViewer;
  pathname: string;
  menuOpen: boolean;
  accountOpen: boolean;
  railOpen: boolean;
  signOut?: () => Promise<void>;
  onToggleMenu?: () => void;
  onToggleAccount?: () => void;
  onOpenPalette?: () => void;
  onNavigate?: () => void;
}) {
  return (
    <div className={cn("signed-rail", railOpen ? "" : "rail-closed")}>
      <div className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b border-border bg-card px-4 lg:hidden">
        <Logo href={homeHref(viewer.role)} />
        <button
          type="button"
          className={cn(buttonVariants({ variant: "outline", size: "icon" }), "ml-auto")}
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          aria-expanded={menuOpen}
          aria-controls="mobile-nav"
          onClick={onToggleMenu}
        >
          {menuOpen ? <X /> : <Menu />}
        </button>
      </div>

      <nav
        aria-label="Primary"
        className={cn(
          "fixed inset-y-0 left-0 z-40 hidden h-dvh border-r border-border bg-card lg:block",
          railOpen ? "w-60" : "w-16",
        )}
      >
        <RailLinks
          viewer={viewer}
          pathname={pathname}
          accountOpen={accountOpen}
          signOut={signOut}
          showLogo
          iconsOnly={!railOpen}
          onOpenPalette={onOpenPalette}
          onToggleAccount={onToggleAccount}
          onNavigate={onNavigate}
        />
      </nav>

      {menuOpen ? (
        <nav
          id="mobile-nav"
          aria-label="Mobile"
          className="flex flex-col border-b border-border bg-card px-3 py-3 lg:hidden"
        >
          <RailLinks
            viewer={viewer}
            pathname={pathname}
            accountOpen={accountOpen}
            signOut={signOut}
            onOpenPalette={onOpenPalette}
            onToggleAccount={onToggleAccount}
            onNavigate={onNavigate}
          />
        </nav>
      ) : null}
    </div>
  );
}

function RailLinks({
  viewer,
  pathname,
  accountOpen,
  signOut,
  showLogo = false,
  iconsOnly = false,
  onOpenPalette,
  onToggleAccount,
  onNavigate,
}: {
  viewer: SignedInViewer;
  pathname: string;
  accountOpen: boolean;
  signOut?: () => Promise<void>;
  showLogo?: boolean;
  iconsOnly?: boolean;
  onOpenPalette?: () => void;
  onToggleAccount?: () => void;
  onNavigate?: () => void;
}) {
  const accountMenuId = useId();
  const roleLabel = viewer.role === "reviewer" ? "Reviewer" : "Member";

  return (
    <div className="flex min-h-0 flex-col lg:h-full">
      <div className="min-h-0 flex-1 overflow-y-auto">
        {showLogo ? (
          <div className={cn("flex items-center pt-4 pb-3", iconsOnly ? "justify-center px-2" : "px-4")}>
            <Logo href={homeHref(viewer.role)} compact={iconsOnly} />
          </div>
        ) : null}
        <div className={cn(iconsOnly ? "px-2" : "px-3", showLogo ? "" : "pt-1 pb-1")}>
          <PageSearchButton onOpen={onOpenPalette} iconsOnly={iconsOnly} />
        </div>
        <div className={cn("mt-3 flex flex-col gap-0.5 pb-3", iconsOnly ? "px-1" : "px-2")}>
          {memberLinks.map((link) => (
            <NavLink
              key={link.href}
              link={link}
              pathname={pathname}
              mobile
              iconsOnly={iconsOnly}
              onClick={onNavigate}
            />
          ))}
          {viewer.role === "reviewer" ? (
            <>
              <ReviewLink
                pathname={pathname}
                waiting={viewer.waiting}
                mobile
                iconsOnly={iconsOnly}
                onClick={onNavigate}
              />
              <ReviewTabs pathname={pathname} iconsOnly={iconsOnly} onNavigate={onNavigate} />
            </>
          ) : null}
        </div>
      </div>
      <div
        className={cn(
          "flex shrink-0 items-center gap-2 border-t border-border py-3",
          iconsOnly ? "justify-center px-2" : "px-3",
        )}
      >
        {iconsOnly ? null : (
          <>
            <p className="min-w-0 flex-1 truncate text-sm text-foreground">{viewer.label}</p>
            <span className="shrink-0 rounded-full bg-primary px-1.5 py-0.5 text-xs text-primary-foreground">
              {roleLabel}
            </span>
          </>
        )}
        <AccountMenu
          open={accountOpen}
          menuId={accountMenuId}
          signOut={signOut}
          onToggle={onToggleAccount}
          onNavigate={onNavigate}
        />
      </div>
    </div>
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
  const [railOpen, setRailOpen] = useState(true);
  const toggleRail = useCallback(() => {
    setRailOpen((open) => !open);
  }, []);
  if (viewer.role === "guest") {
    return <GuestHeaderControls key={pathname} pathname={pathname} />;
  }
  // The controls below remount on every path. The open or closed rail
  // stays here so one click does not pop it back open on the next page.
  return (
    <SignedInControls
      key={pathname}
      viewer={viewer}
      signOut={signOut}
      pathname={pathname}
      railOpen={railOpen}
      onToggleRail={toggleRail}
    />
  );
}

function GuestHeaderControls({ pathname }: { pathname: string }) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <GuestHeaderBar
      pathname={pathname}
      menuOpen={menuOpen}
      onToggleMenu={() => setMenuOpen((open) => !open)}
      onNavigate={() => setMenuOpen(false)}
    />
  );
}

function SignedInControls({
  viewer,
  signOut,
  pathname,
  railOpen,
  onToggleRail,
}: {
  viewer: SignedInViewer;
  signOut?: () => Promise<void>;
  pathname: string;
  railOpen: boolean;
  onToggleRail: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.altKey || event.shiftKey || event.repeat) {
        return;
      }
      if (!event.metaKey && !event.ctrlKey) {
        return;
      }
      const key = event.key.toLowerCase();
      // Chrome uses Ctrl+K for the address bar and Ctrl+B for bookmarks.
      if (key === "k") {
        event.preventDefault();
        setAccountOpen(false);
        setPaletteOpen((open) => !open);
        return;
      }
      if (key === "b") {
        event.preventDefault();
        if (isWideScreen()) {
          onToggleRail();
          return;
        }
        setMenuOpen((open) => !open);
      }
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onToggleRail]);

  function closeTransient() {
    setMenuOpen(false);
    setAccountOpen(false);
    setPaletteOpen(false);
  }

  return (
    <>
      <SignedInRail
        viewer={viewer}
        pathname={pathname}
        menuOpen={menuOpen}
        accountOpen={accountOpen}
        railOpen={railOpen}
        signOut={signOut}
        onToggleMenu={() => setMenuOpen((open) => !open)}
        onToggleAccount={() => setAccountOpen((open) => !open)}
        onOpenPalette={() => {
          setAccountOpen(false);
          setPaletteOpen(true);
        }}
        onNavigate={closeTransient}
      />
      {paletteOpen ? (
        <PageSearchDialog
          pages={pagesFor(viewer)}
          onClose={() => setPaletteOpen(false)}
          onNavigate={closeTransient}
        />
      ) : null}
    </>
  );
}

export function SiteHeaderFallback() {
  return <GuestHeaderBar pathname="" menuOpen={false} />;
}

function Logo({ href, compact = false }: { href: string; compact?: boolean }) {
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
      {compact ? null : <span className="text-sm font-semibold tracking-tight">PriceTrail</span>}
    </Link>
  );
}

function NavLink({
  link,
  pathname,
  mobile = false,
  iconsOnly = false,
  onClick,
}: {
  link: HeaderLink & { icon?: LucideIcon };
  pathname: string;
  mobile?: boolean;
  iconsOnly?: boolean;
  onClick?: () => void;
}) {
  const active = linkIsCurrent(link.href, pathname);
  const Icon = link.icon;
  return (
    <Link
      href={link.href}
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={cn(navClass(active, mobile), iconsOnly && "justify-center")}
    >
      {Icon ? <Icon aria-hidden="true" className="size-4 shrink-0" /> : null}
      <span className={iconsOnly ? "sr-only" : undefined}>{link.label}</span>
    </Link>
  );
}

function ReviewLink({
  pathname,
  waiting,
  mobile = false,
  iconsOnly = false,
  onClick,
}: {
  pathname: string;
  waiting: number | null;
  mobile?: boolean;
  iconsOnly?: boolean;
  onClick?: () => void;
}) {
  const active = isProtectedReviewPath(pathname);
  const showCount = waiting !== null && waiting > 0 && !iconsOnly;
  return (
    <Link
      href="/review"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={cn(navClass(active, mobile), iconsOnly && "justify-center")}
    >
      <ClipboardList aria-hidden="true" className="size-4 shrink-0" />
      <span className={iconsOnly ? "sr-only" : undefined}>Review</span>
      {showCount ? (
        <span className="ml-auto rounded-full border border-border px-1.5 text-xs tabular-nums text-foreground">
          {waiting}
        </span>
      ) : null}
    </Link>
  );
}

function ReviewTabs({
  pathname,
  iconsOnly = false,
  onNavigate,
}: {
  pathname: string;
  iconsOnly?: boolean;
  onNavigate?: () => void;
}) {
  return (
    <nav
      aria-label="Review"
      className={cn(
        "flex flex-col gap-0.5",
        iconsOnly ? "" : "ml-4 border-l border-border pl-1",
      )}
    >
      {reviewTabs.map((tab) => {
        const active = reviewTabIsCurrent(tab.href, pathname);
        const Icon = tab.icon;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(navClass(active, true), iconsOnly && "justify-center")}
          >
            <Icon aria-hidden="true" className="size-4 shrink-0" />
            <span className={iconsOnly ? "sr-only" : undefined}>{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

function PageSearchButton({
  onOpen,
  iconsOnly = false,
}: {
  onOpen?: () => void;
  iconsOnly?: boolean;
}) {
  if (iconsOnly) {
    return (
      <button
        type="button"
        onClick={onOpen}
        className="mx-auto flex size-8 items-center justify-center rounded-lg border border-input text-muted-foreground"
      >
        <Search aria-hidden="true" className="size-4" />
        <span className="sr-only">Search pages</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onOpen}
      className="relative flex h-8 w-full items-center rounded-lg border border-input bg-transparent pr-20 pl-2.5 text-left text-sm text-muted-foreground"
    >
      Search pages
      <kbd
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 right-1.5 -translate-y-1/2 rounded border border-border px-1 text-[10px]"
      >
        ⌘/Ctrl K
      </kbd>
    </button>
  );
}

function PageSearchDialog({
  pages,
  onClose,
  onNavigate,
}: {
  pages: readonly RailLink[];
  onClose: () => void;
  onNavigate: () => void;
}) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const matches = pages.filter((page) =>
    page.label.toLowerCase().includes(query.trim().toLowerCase()),
  );

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  function onKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    const root = event.currentTarget;
    const links = [...root.querySelectorAll<HTMLAnchorElement>("a[href]")];
    const input = inputRef.current;
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      const index = links.indexOf(document.activeElement as HTMLAnchorElement);
      const next = index < 0 ? 0 : Math.min(index + 1, links.length - 1);
      links[next]?.focus();
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      const index = links.indexOf(document.activeElement as HTMLAnchorElement);
      if (index <= 0) {
        input?.focus();
        return;
      }
      links[index - 1]?.focus();
      return;
    }
    if (event.key === "Enter" && document.activeElement === input) {
      event.preventDefault();
      links[0]?.click();
      return;
    }
    if (event.key !== "Tab") {
      return;
    }
    const focusable: HTMLElement[] = input ? [input, ...links] : links;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 px-4 pt-[15vh]"
      onMouseDown={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search pages"
        data-page-search=""
        className="w-full max-w-xl overflow-hidden rounded-lg border border-border bg-card"
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <div className="flex items-center gap-2 border-b border-border px-3">
          <Search aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search pages"
            aria-label="Search pages"
            autoComplete="off"
            className="h-12 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <kbd className="rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
            esc
          </kbd>
        </div>
        {matches.length === 0 ? (
          <p className="px-4 py-8 text-sm text-muted-foreground">No pages match.</p>
        ) : (
          <ul className="max-h-96 overflow-y-auto py-2">
            {matches.map((page) => {
              const Icon = page.icon;
              return (
                <li key={page.href}>
                  <Link
                    href={page.href}
                    onClick={onNavigate}
                    className="flex items-center gap-3 px-4 py-2.5 text-sm text-foreground hover:bg-muted focus:bg-primary/10 focus:text-primary"
                  >
                    <Icon aria-hidden="true" className="size-4 shrink-0" />
                    {page.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
        <div className="flex items-center gap-4 border-t border-border px-4 py-2 text-xs text-muted-foreground">
          <span>↑↓ Navigate</span>
          <span>↵ Select</span>
          <span className="ml-auto">⌘K</span>
        </div>
      </div>
    </div>
  );
}

function guestLinks(pathname: string): HeaderLink[] {
  if (pathname === "/") {
    return [...guestPageLinks, landingHowItWorks];
  }
  return guestPageLinks;
}

function AccountMenu({
  open,
  menuId,
  signOut,
  onToggle,
  onNavigate,
}: {
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
          className="absolute right-0 bottom-full z-50 mb-2 w-56 rounded-lg border border-border bg-card py-1"
        >
          <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-1">
            <span className="text-sm text-foreground">Theme</span>
            <ThemeToggle />
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
      ? "flex w-full items-center gap-2 rounded-md bg-primary/10 px-2 py-2 text-sm text-primary hover:bg-primary/15"
      : "flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm text-foreground hover:bg-muted";
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
