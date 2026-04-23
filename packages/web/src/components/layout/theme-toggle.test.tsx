import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import { ThemeToggle } from "./theme-toggle.js";

// Mock useTheme so the component can render without a real ThemeProvider + DOM setup
const mockToggle = vi.fn();
let mockTheme: "dark" | "light" = "dark";

vi.mock("@/hooks/use-theme.js", () => ({
  useTheme: () => ({ theme: mockTheme, toggleTheme: mockToggle, setTheme: vi.fn() }),
}));

describe("ThemeToggle", () => {
  it("renders a button", () => {
    render(<ThemeToggle />);
    expect(screen.getByRole("button")).toBeDefined();
  });

  it("shows sun icon and 'Switch to light mode' label when theme is dark", () => {
    mockTheme = "dark";
    render(<ThemeToggle />);
    const btn = screen.getByRole("button");
    expect(btn.getAttribute("aria-label")).toBe("Switch to light mode");
    expect(btn.textContent).toContain("☀");
  });

  it("shows moon icon and 'Switch to dark mode' label when theme is light", () => {
    mockTheme = "light";
    render(<ThemeToggle />);
    const btn = screen.getByRole("button");
    expect(btn.getAttribute("aria-label")).toBe("Switch to dark mode");
    expect(btn.textContent).toContain("☾");
  });

  it("calls toggleTheme when clicked", () => {
    mockTheme = "dark";
    mockToggle.mockClear();
    render(<ThemeToggle />);
    fireEvent.click(screen.getByRole("button"));
    expect(mockToggle).toHaveBeenCalledOnce();
  });
});
