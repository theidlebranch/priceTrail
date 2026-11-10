"use client";

import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  THEME_STORAGE_KEY,
  applyDocumentTheme,
  readThemePreference,
  themeIsDark,
  type ThemePreference,
} from "@/components/theme";

const THEME_CHANGE_EVENT = "price-trail-theme-change";

type ThemeAppearance = "light" | "dark";

/**
 * The picture is chosen with CSS from the `dark` class, which the
 * before-paint script already set. That way a dark device shows the moon
 * on the first paint. This store only keeps the button name in step.
 */
function subscribe(onStoreChange: () => void) {
  const onStorage = (event: Event) => {
    if (event instanceof StorageEvent && event.key !== null && event.key !== THEME_STORAGE_KEY) {
      return;
    }
    applyDocumentTheme(readThemePreference(localStorage.getItem(THEME_STORAGE_KEY)));
    onStoreChange();
  };

  window.addEventListener("storage", onStorage);
  window.addEventListener(THEME_CHANGE_EVENT, onStorage);

  let media: MediaQueryList | null = null;
  const onMedia = () => {
    if (readThemePreference(localStorage.getItem(THEME_STORAGE_KEY)) !== "system") {
      return;
    }
    applyDocumentTheme("system");
    onStoreChange();
  };
  if (typeof window.matchMedia === "function") {
    media = window.matchMedia("(prefers-color-scheme: dark)");
    media.addEventListener("change", onMedia);
  }

  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(THEME_CHANGE_EVENT, onStorage);
    media?.removeEventListener("change", onMedia);
  };
}

function appearanceFrom(preference: ThemePreference, prefersDark: boolean): ThemeAppearance {
  return themeIsDark(preference, prefersDark) ? "dark" : "light";
}

function getSnapshot(): ThemeAppearance {
  const preference = readThemePreference(localStorage.getItem(THEME_STORAGE_KEY));
  const prefersDark =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches;
  return appearanceFrom(preference, prefersDark);
}

function getServerSnapshot(): ThemeAppearance {
  return "light";
}

export function ThemeToggle() {
  const appearance = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  function onClick() {
    const next: ThemeAppearance = document.documentElement.classList.contains("dark")
      ? "light"
      : "dark";
    localStorage.setItem(THEME_STORAGE_KEY, next);
    applyDocumentTheme(next);
    window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="hover:bg-transparent active:bg-transparent dark:hover:bg-transparent"
      aria-label={appearance === "dark" ? "Theme: dark" : "Theme: light"}
      onClick={onClick}
    >
      <Sun className="dark:hidden" />
      <Moon className="hidden dark:block" />
    </Button>
  );
}
