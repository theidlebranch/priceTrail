"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";

const links = [
  { label: "Browse models", href: "/models" },
  { label: "Receipts", href: "/#receipts" },
  { label: "How it works", href: "/#how-it-works" },
  { label: "Honest by design", href: "/#honest" },
];

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

export function SiteHeader() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-border bg-card">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-10">
        <Logo />

        <nav aria-label="Primary" className="hidden items-center gap-8 lg:flex">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="py-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <Link
            href="/models"
            className={`${buttonVariants({ size: "sm" })} hidden sm:inline-flex`}
          >
            Browse models
          </Link>
          <Button
            variant="outline"
            size="icon"
            className="lg:hidden"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            aria-controls="mobile-nav"
            onClick={() => setMenuOpen((open) => !open)}
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
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setMenuOpen(false)}
              className="rounded-md px-2 py-2 text-sm text-foreground hover:bg-muted"
            >
              {link.label}
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}
