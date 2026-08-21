"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

export type Theme = "light" | "dark" | "system";
export type ResolvedTheme = Exclude<Theme, "system">;

export interface ThemeProviderProps {
  readonly attribute?: "class";
  readonly children?: ReactNode;
  readonly defaultTheme?: Theme;
  readonly enableSystem?: boolean;
}

interface ThemeContextValue {
  readonly theme: Theme;
  readonly resolvedTheme: ResolvedTheme;
  readonly setTheme: (theme: string) => void;
}

const STORAGE_KEY = "theme";
const SYSTEM_MEDIA_QUERY = "(prefers-color-scheme: dark)";
const DEFAULT_THEME: ResolvedTheme = "light";

export const THEME_BOOTSTRAP_SCRIPT = `(function () {
  var root = document.documentElement;
  var script = document.currentScript;
  var fallbackTheme = script && script.getAttribute("data-default-theme");
  var enableSystem = !script || script.getAttribute("data-enable-system") !== "false";

  if (fallbackTheme !== "light" && fallbackTheme !== "dark" && fallbackTheme !== "system") {
    fallbackTheme = "light";
  }

  var theme = fallbackTheme;
  try {
    var storedTheme = window.localStorage.getItem("theme");
    if (storedTheme === "light" || storedTheme === "dark" || storedTheme === "system") {
      theme = storedTheme;
    }
  } catch (error) {
    void error;
  }

  var resolvedTheme = theme;
  if (theme === "system") {
    if (enableSystem) {
      try {
        resolvedTheme = window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light";
      } catch (error) {
        void error;
        resolvedTheme = "light";
      }
    } else {
      resolvedTheme = "light";
    }
  }

  root.classList.remove("light", "dark");
  root.classList.add(resolvedTheme);
  root.style.colorScheme = resolvedTheme;
})();`;

const ThemeContext = createContext<ThemeContextValue>({
  theme: DEFAULT_THEME,
  resolvedTheme: DEFAULT_THEME,
  setTheme: () => undefined,
});

function isTheme(value: string | null | undefined): value is Theme {
  return value === "light" || value === "dark" || value === "system";
}

function readStoredTheme(): Theme | null {
  if (typeof window === "undefined") return null;

  try {
    const storedTheme = window.localStorage.getItem(STORAGE_KEY);
    return isTheme(storedTheme) ? storedTheme : null;
  } catch {
    return null;
  }
}

function getSystemTheme(): ResolvedTheme {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return DEFAULT_THEME;
  }

  try {
    return window.matchMedia(SYSTEM_MEDIA_QUERY).matches ? "dark" : "light";
  } catch {
    return DEFAULT_THEME;
  }
}

function resolveTheme(
  theme: Theme,
  systemTheme: ResolvedTheme,
  enableSystem: boolean,
): ResolvedTheme {
  if (theme === "system") return enableSystem ? systemTheme : DEFAULT_THEME;
  return theme;
}

function applyTheme(theme: ResolvedTheme, attribute: "class"): void {
  if (typeof document === "undefined") return;

  const root = document.documentElement;
  if (attribute === "class") {
    root.classList.remove("light", "dark");
    root.classList.add(theme);
  }
  root.style.colorScheme = theme;
}

export function ThemeProvider({
  attribute = "class",
  children,
  defaultTheme,
  enableSystem = true,
}: ThemeProviderProps) {
  const initialTheme = isTheme(defaultTheme)
    ? defaultTheme
    : enableSystem
      ? "system"
      : DEFAULT_THEME;
  const [theme, setThemeState] = useState<Theme>(initialTheme);
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(DEFAULT_THEME);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setThemeState(readStoredTheme() ?? initialTheme);
    setSystemTheme(enableSystem ? getSystemTheme() : DEFAULT_THEME);
    setHydrated(true);
  }, [enableSystem, initialTheme]);

  useEffect(() => {
    if (typeof window === "undefined" || !enableSystem || typeof window.matchMedia !== "function") {
      setSystemTheme(DEFAULT_THEME);
      return undefined;
    }

    const media = window.matchMedia(SYSTEM_MEDIA_QUERY);
    const updateSystemTheme = () => {
      setSystemTheme(media.matches ? "dark" : "light");
    };

    updateSystemTheme();
    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", updateSystemTheme);
      return () => media.removeEventListener("change", updateSystemTheme);
    }

    if (typeof media.addListener === "function") {
      media.addListener(updateSystemTheme);
      return () => media.removeListener(updateSystemTheme);
    }

    return undefined;
  }, [enableSystem]);

  useEffect(() => {
    if (!hydrated) return;
    applyTheme(resolveTheme(theme, systemTheme, enableSystem), attribute);
  }, [attribute, enableSystem, hydrated, systemTheme, theme]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const handleStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY) return;
      setThemeState(isTheme(event.newValue) ? event.newValue : initialTheme);
    };

    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [initialTheme]);

  const setTheme = useCallback((nextTheme: string) => {
    if (typeof window === "undefined") return;
    if (!isTheme(nextTheme)) return;

    setThemeState(nextTheme);
    try {
      window.localStorage.setItem(STORAGE_KEY, nextTheme);
    } catch {
      return;
    }
  }, []);

  const resolvedTheme = resolveTheme(theme, systemTheme, enableSystem);
  const contextValue = useMemo(
    () => ({ theme, resolvedTheme, setTheme }),
    [resolvedTheme, setTheme, theme],
  );

  return (
    <ThemeContext.Provider value={contextValue}>
      <script
        data-default-theme={initialTheme}
        data-enable-system={enableSystem ? "true" : "false"}
        suppressHydrationWarning
      >
        {THEME_BOOTSTRAP_SCRIPT}
      </script>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
