"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

export function ThemeToggle() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const activeTheme = theme === "system" ? resolvedTheme : theme;
  const isDark = activeTheme === "dark";

  return (
    <button
      className="product-theme-toggle"
      type="button"
      aria-label="Toggle color theme"
      title="Toggle color theme"
      onClick={() => setTheme(isDark ? "light" : "dark")}
    >
      <Sun className="product-theme-icon product-theme-icon-light" aria-hidden="true" />
      <Moon className="product-theme-icon product-theme-icon-dark" aria-hidden="true" />
    </button>
  );
}
