export type ThemeMode = "light" | "dark" | "system";

export const THEME_STORAGE_KEY = "mbg-theme";

export function resolveTheme(mode: ThemeMode): "light" | "dark" {
  if (mode === "system") {
    if (typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches) {
      return "dark";
    }
    return "light";
  }
  return mode;
}

export function applyTheme(mode: ThemeMode): void {
  if (typeof document === "undefined") {
    return;
  }
  const resolved = resolveTheme(mode);
  document.documentElement.setAttribute("data-theme", resolved);
}

