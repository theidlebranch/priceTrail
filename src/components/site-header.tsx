"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";

const links = [
  { label: "Browse models", href: "/models" },
  { label: "Receipts", href: "/#receipts" },
  { label: "How it works", href: "/#how-it-works" },
  { label: "Honest by design", href: "/#honest" },
];

function isModelsPath(pathname: string) {
  return pathname === "/models" || pathname.startsWith("/models/");
}

/**
 * The same bar the real header uses. The fallback passes an empty path
 * and a closed menu, so no link is marked current and the menu button
 * does nothing until the real header replaces it.
 */
function SiteHeaderView({
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
  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-border bg-card">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-10">
        <Logo />

        <div className="flex items-center gap-2">
          <nav aria-label="Primary" className="hidden items-center gap-8 lg:flex">
            {links.map((link) => (
              <NavLink key={link.href} href={link.href} pathname={pathname}>
                {link.label}
              </NavLink>
            ))}
          </nav>
          <ThemeToggle />
          <Button
            variant="outline"
            size="icon"
            className="lg:hidden"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            aria-controls="mobile-nav"
            onClick={onToggleMenu}
          >
            {menuOpen ? <X className="size-4" /> : <Menu className="size-4" />}
          </Button>
        </div>
      </div>

      {menuOpen && (
        <nav
          id="mobile-nav"
          aria-label="Mobile"
          className="flex flex-col gap-1 border-t border-border bg-card px-4 py-3 lg:hidden"
        >
          {links.map((link) => (
            <NavLink
              key={link.href}
              href={link.href}
              pathname={pathname}
              mobile
              onClick={onNavigate}
            >
              {link.label}
            </NavLink>
          ))}
        </nav>
      )}
    </header>
  );
}

export function SiteHeader() {
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname() ?? "";

  return (
    <SiteHeaderView
      pathname={pathname}
      menuOpen={menuOpen}
      onToggleMenu={() => setMenuOpen((open) => !open)}
      onNavigate={() => setMenuOpen(false)}
    />
  );
}

export function SiteHeaderFallback() {
  return <SiteHeaderView pathname="" menuOpen={false} />;
}

function NavLink({
  href,
  pathname,
  mobile = false,
  onClick,
  children,
}: {
  href: string;
  pathname: string;
  mobile?: boolean;
  onClick?: () => void;
  children: string;
}) {
  const active = href === "/models" && isModelsPath(pathname);
  const className = mobile
    ? active
      ? "rounded-md px-2 py-2 text-sm text-primary hover:bg-muted"
      : "rounded-md px-2 py-2 text-sm text-foreground hover:bg-muted"
    : active
      ? "py-1 text-sm text-primary transition-colors"
      : "py-1 text-sm text-muted-foreground transition-colors hover:text-foreground";

  return (
    <Link
      href={href}
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={className}
    >
      {children}
    </Link>
  );
}

function Logo() {
  return (
    <Link
      href="/#top"
      aria-label="PriceTrail home"
      className="flex items-center gap-2"
    >
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
        <path
          d="M12 13V23"
          stroke="#FFFFFF"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
        <circle cx="12" cy="25.5" r="2.25" fill="#9CF2E8" />
      </svg>
      <span className="text-sm font-semibold uppercase tracking-tight">
        PriceTrail
      </span>
    </Link>
  );
}
