import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
  createElement,
} from "react";

export type Theme = "dark" | "light";

const STORAGE_KEY = "atc.theme";
const TRANSITION_CLASS = "theme-transition";
const TRANSITION_DURATION_MS = 300;

/**
 * Reads the active theme from localStorage, falling back to the OS preference.
 * @see AIR-115
 */
export function getInitialTheme(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "dark" || stored === "light") return stored;
  } catch {
    // localStorage unavailable (e.g. SSR, private-browsing restrictions)
  }
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

function applyThemeToDom(theme: Theme) {
  document.documentElement.setAttribute("data-theme", theme);
}

interface ThemeContextValue {
  /** Current active theme. */
  theme: Theme;
  /** Toggle between dark and light. Adds smooth CSS transition; skips it on initial render. */
  toggleTheme: () => void;
  /** Explicitly set the theme. */
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

interface ThemeProviderProps {
  children: ReactNode;
}

/**
 * Provides theme state to the application. Must wrap the root of the component tree.
 * Reads initial theme from localStorage / OS preference and keeps DOM in sync.
 * @see AIR-115
 */
export function ThemeProvider({ children }: ThemeProviderProps) {
  const [theme, setThemeState] = useState<Theme>(getInitialTheme);

  // Sync DOM on mount in case the blocking script set a different value than the
  // React initial state (edge case: localStorage changed between script and hydration).
  useEffect(() => {
    applyThemeToDom(theme);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const setTheme = useCallback((next: Theme) => {
    document.documentElement.classList.add(TRANSITION_CLASS);
    applyThemeToDom(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // ignore storage errors
    }
    setThemeState(next);
    setTimeout(() => {
      document.documentElement.classList.remove(TRANSITION_CLASS);
    }, TRANSITION_DURATION_MS);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(theme === "dark" ? "light" : "dark");
  }, [theme, setTheme]);

  const value = useMemo(
    () => ({ theme, toggleTheme, setTheme }),
    [theme, toggleTheme, setTheme],
  );

  return createElement(ThemeContext.Provider, { value }, children);
}

/**
 * Returns the current theme and controls for toggling or setting it.
 * Must be called inside a `ThemeProvider`.
 * @see AIR-115
 */
export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return ctx;
}
