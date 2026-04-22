import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import React from "react";
import { ThemeProvider, useTheme, getInitialTheme } from "./use-theme.js";

// ---------- localStorage helpers ----------

const storageStore: Record<string, string> = {};

const localStorageMock = {
  getItem: vi.fn((key: string) => storageStore[key] ?? null),
  setItem: vi.fn((key: string, value: string) => {
    storageStore[key] = value;
  }),
  removeItem: vi.fn((key: string) => {
    delete storageStore[key];
  }),
  clear: vi.fn(() => {
    for (const k of Object.keys(storageStore)) delete storageStore[k];
  }),
};

// ---------- matchMedia helpers ----------

function mockMatchMedia(prefersDark: boolean) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn((query: string) => ({
      matches: query === "(prefers-color-scheme: light)" ? !prefersDark : prefersDark,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  });
}

// ---------- test setup ----------

beforeEach(() => {
  Object.defineProperty(window, "localStorage", { value: localStorageMock, writable: true });
  localStorageMock.clear();
  vi.clearAllMocks();
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.classList.remove("theme-transition");
  mockMatchMedia(true); // default: OS prefers dark
});

afterEach(() => {
  vi.useRealTimers();
});

// ---------- getInitialTheme ----------

describe("getInitialTheme", () => {
  it("returns stored 'dark' when localStorage has dark", () => {
    storageStore["atc.theme"] = "dark";
    expect(getInitialTheme()).toBe("dark");
  });

  it("returns stored 'light' when localStorage has light", () => {
    storageStore["atc.theme"] = "light";
    expect(getInitialTheme()).toBe("light");
  });

  it("falls back to OS dark when no stored value and OS prefers dark", () => {
    mockMatchMedia(true);
    expect(getInitialTheme()).toBe("dark");
  });

  it("falls back to OS light when no stored value and OS prefers light", () => {
    mockMatchMedia(false);
    expect(getInitialTheme()).toBe("light");
  });

  it("ignores invalid stored values and falls back to OS preference", () => {
    storageStore["atc.theme"] = "sepia";
    mockMatchMedia(false);
    expect(getInitialTheme()).toBe("light");
  });
});

// ---------- useTheme ----------

function wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(ThemeProvider, null, children);
}

describe("useTheme", () => {
  it("throws when used outside ThemeProvider", () => {
    expect(() => renderHook(() => useTheme())).toThrow(
      "useTheme must be used within a ThemeProvider",
    );
  });

  it("returns the initial theme from localStorage", () => {
    storageStore["atc.theme"] = "light";
    const { result } = renderHook(() => useTheme(), { wrapper });
    expect(result.current.theme).toBe("light");
  });

  it("returns OS dark when no stored value and OS prefers dark", () => {
    mockMatchMedia(true);
    const { result } = renderHook(() => useTheme(), { wrapper });
    expect(result.current.theme).toBe("dark");
  });

  it("toggleTheme switches dark → light", () => {
    storageStore["atc.theme"] = "dark";
    const { result } = renderHook(() => useTheme(), { wrapper });
    act(() => {
      result.current.toggleTheme();
    });
    expect(result.current.theme).toBe("light");
  });

  it("toggleTheme switches light → dark", () => {
    storageStore["atc.theme"] = "light";
    const { result } = renderHook(() => useTheme(), { wrapper });
    act(() => {
      result.current.toggleTheme();
    });
    expect(result.current.theme).toBe("dark");
  });

  it("setTheme persists to localStorage", () => {
    const { result } = renderHook(() => useTheme(), { wrapper });
    act(() => {
      result.current.setTheme("light");
    });
    expect(localStorageMock.setItem).toHaveBeenCalledWith("atc.theme", "light");
  });

  it("setTheme updates data-theme attribute on <html>", () => {
    const { result } = renderHook(() => useTheme(), { wrapper });
    act(() => {
      result.current.setTheme("light");
    });
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });

  it("adds theme-transition class during toggle and removes it after 300ms", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useTheme(), { wrapper });
    act(() => {
      result.current.toggleTheme();
    });
    expect(document.documentElement.classList.contains("theme-transition")).toBe(true);
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(document.documentElement.classList.contains("theme-transition")).toBe(false);
  });
});
