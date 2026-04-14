import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/lib/glossary-data", () => {
  const GLOSSARY = [
    { term: "Craft", definition: "A unit of work tied to a git branch." },
    { term: "Vector", definition: "A milestone with acceptance criteria." },
    { term: "Tower", definition: "Merge coordinator, one per repo." },
  ];
  const RULES = [
    {
      id: "RULE-CRAFT-1",
      prefix: "CRAFT",
      summary: "Craft callsign must be unique and immutable.",
      section: "2.1",
    },
    {
      id: "RULE-CTRL-1",
      prefix: "CTRL",
      summary: "Captain holds exclusive controls at craft creation.",
      section: "2.2.4",
    },
    {
      id: "RULE-CTRL-2",
      prefix: "CTRL",
      summary: "Only captain or first officer may hold controls.",
      section: "2.2.4",
    },
  ];
  return {
    GLOSSARY,
    RULES,
    groupRulesByPrefix: (rules: typeof RULES = RULES) => {
      const groups = new Map<string, typeof RULES>();
      for (const r of rules) {
        const list = groups.get(r.prefix) ?? [];
        list.push(r);
        groups.set(r.prefix, list);
      }
      return Array.from(groups.entries())
        .map(([prefix, rules]) => ({ prefix, rules }))
        .sort((a, b) => a.prefix.localeCompare(b.prefix));
    },
  };
});

import { GlossaryModal } from "./glossary-modal.js";

describe("GlossaryModal", () => {
  it("does not render when closed", () => {
    render(<GlossaryModal open={false} onClose={() => {}} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("renders glossary entries by default", () => {
    render(<GlossaryModal open={true} onClose={() => {}} />);
    expect(screen.getByText("Craft")).toBeTruthy();
    expect(screen.getByText(/unit of work/)).toBeTruthy();
  });

  it("switches to the rules tab and groups by prefix", async () => {
    const user = userEvent.setup();
    render(<GlossaryModal open={true} onClose={() => {}} />);
    await user.click(screen.getByRole("button", { name: /rules/i }));
    expect(screen.getByText("RULE-CTRL-1")).toBeTruthy();
    expect(screen.getByText(/CTRL \(2\)/)).toBeTruthy();
  });

  it("filters glossary entries by query", async () => {
    const user = userEvent.setup();
    render(<GlossaryModal open={true} onClose={() => {}} />);
    const input = screen.getByLabelText("Filter");
    await user.type(input, "tower");
    expect(screen.getByText("Tower")).toBeTruthy();
    expect(screen.queryByText("Craft")).toBeNull();
  });

  it("filters rules by query", async () => {
    const user = userEvent.setup();
    render(<GlossaryModal open={true} onClose={() => {}} />);
    await user.click(screen.getByRole("button", { name: /rules/i }));
    const input = screen.getByLabelText("Filter");
    await user.type(input, "captain");
    expect(screen.getByText("RULE-CTRL-1")).toBeTruthy();
    expect(screen.queryByText("RULE-CRAFT-1")).toBeNull();
  });

  it("calls onClose when pressing Escape", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<GlossaryModal open={true} onClose={onClose} />);
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
  });
});
