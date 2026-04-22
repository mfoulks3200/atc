import { useTheme } from "@/hooks/use-theme.js";

/**
 * Icon button that toggles between dark and light themes.
 * Matches the visual style of the `?` glossary button in the header.
 * @see AIR-115
 */
export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className="flex h-6 w-6 items-center justify-center rounded-full border text-[11px]"
      style={{
        borderColor: "var(--border)",
        color: "var(--text-muted)",
        backgroundColor: "var(--bg-elevated)",
      }}
    >
      {isDark ? "☀" : "☾"}
    </button>
  );
}
