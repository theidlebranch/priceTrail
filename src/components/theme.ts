export const THEME_STORAGE_KEY = "price-trail-theme";

export type ThemePreference = "system" | "light" | "dark";

/**
 * A missing or unknown saved value means "follow the device".
 * The inline script below repeats this check. It has to, because it runs
 * before the page's JavaScript bundle, so it cannot import this function.
 */
export function readThemePreference(stored: string | null): ThemePreference {
  if (stored === "light" || stored === "dark" || stored === "system") {
    return stored;
  }
  return "system";
}

export function themeIsDark(preference: ThemePreference, prefersDark: boolean): boolean {
  if (preference === "dark") {
    return true;
  }
  if (preference === "light") {
    return false;
  }
  return prefersDark;
}

export function applyDocumentTheme(preference: ThemePreference): void {
  const prefersDark =
    preference === "system" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches;
  const dark = themeIsDark(preference, prefersDark);
  document.documentElement.classList.toggle("dark", dark);
  document.documentElement.style.colorScheme = dark ? "dark" : "light";
}

export const themeInitScript = `(function(){try{var stored=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});var preference=stored==="light"||stored==="dark"||stored==="system"?stored:"system";var prefersDark=window.matchMedia("(prefers-color-scheme: dark)").matches;var dark=preference==="dark"||(preference==="system"&&prefersDark);var root=document.documentElement;root.classList.toggle("dark",dark);root.style.colorScheme=dark?"dark":"light";}catch(e){}})();`;
