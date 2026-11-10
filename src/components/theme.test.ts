import { afterEach, describe, expect, it } from "vitest";
import { THEME_STORAGE_KEY, themeInitScript, themeIsDark } from "@/components/theme";

function installMatchMedia(prefersDark: boolean) {
  window.matchMedia = (query: string) =>
    ({
      matches: query === "(prefers-color-scheme: dark)" ? prefersDark : false,
      media: query,
      onchange: null,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
      dispatchEvent() {
        return false;
      },
    }) as MediaQueryList;
}

function runInitScript() {
  window.eval(themeInitScript);
}

afterEach(() => {
  localStorage.removeItem(THEME_STORAGE_KEY);
  document.documentElement.classList.remove("dark");
  document.documentElement.style.colorScheme = "";
});

describe("themeIsDark", () => {
  it("follows a dark device when the choice is system", () => {
    expect(themeIsDark("system", true)).toBe(true);
  });

  it("stays light when that choice is saved, even on a dark device", () => {
    expect(themeIsDark("light", true)).toBe(false);
  });

  it("stays dark when that choice is saved, even on a light device", () => {
    expect(themeIsDark("dark", false)).toBe(true);
  });
});

describe("themeInitScript", () => {
  it("follows a dark device when nothing is saved", () => {
    installMatchMedia(true);
    runInitScript();
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.documentElement.style.colorScheme).toBe("dark");
  });

  it("uses a saved light choice on a dark device", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "light");
    installMatchMedia(true);
    runInitScript();
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(document.documentElement.style.colorScheme).toBe("light");
  });

  it("uses a saved dark choice on a light device", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "dark");
    installMatchMedia(false);
    runInitScript();
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.documentElement.style.colorScheme).toBe("dark");
  });
});
