import { useCallback, useEffect, useState } from "react";

// The choice is kept per browser; without one the app follows the system setting.
// index.html applies it before the first paint, so there is no flash of the wrong theme.
const THEME_KEY = "margen-theme";
type Theme = "light" | "dark";

const currentTheme = () => (document.documentElement.dataset.theme === "dark" ? "dark" : "light");

function savedTheme() {
  try {
    return localStorage.getItem(THEME_KEY);
  } catch {
    return null;
  }
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(currentTheme);

  const apply = useCallback((next: Theme) => {
    document.documentElement.dataset.theme = next;
    setThemeState(next);
  }, []);

  useEffect(() => {
    const media = matchMedia("(prefers-color-scheme: dark)");
    const follow = (event: MediaQueryListEvent) => {
      if (!savedTheme()) apply(event.matches ? "dark" : "light");
    };
    media.addEventListener("change", follow);
    return () => media.removeEventListener("change", follow);
  }, [apply]);

  const toggle = useCallback(() => {
    const next = currentTheme() === "dark" ? "light" : "dark";
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      // Storage can be blocked; the switch still works for this visit.
    }
    apply(next);
  }, [apply]);

  return { theme, toggle };
}
