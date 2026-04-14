import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/lib/glossary-data", () => {
  const GLOSSARY = [
    { term: "Craft", definition: "A unit of work tied to a git branch." },
    { term: "Vector", definition: "A milestone with acceptance criteria." },
  ];
  const RULES = [
    {
      id: "RULE-CRAFT-1",
      prefix: "CRAFT",
      summary: "Craft callsign must be unique and immutable.",
      section: "2.1",
    },
  ];
  const termIndex = new Map(GLOSSARY.map((t) => [t.term.toLowerCase(), t]));
  const ruleIndex = new Map(RULES.map((r) => [r.id, r]));
  return {
    GLOSSARY,
    RULES,
    findTerm: (term: string) => termIndex.get(term.toLowerCase()),
    findRule: (id: string) => ruleIndex.get(id),
    groupRulesByPrefix: () => [{ prefix: "CRAFT", rules: RULES }],
  };
});

import { TermHint } from "./term-hint.js";

describe("TermHint", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("renders a trigger with accessible label for a known term", () => {
    render(<TermHint term="Craft">Craft</TermHint>);
    expect(screen.getByRole("button", { name: /definition of craft/i })).toBeTruthy();
  });

  it("shows the term definition on hover", async () => {
    const user = userEvent.setup();
    render(<TermHint term="Craft">Craft</TermHint>);
    await user.hover(screen.getByRole("button", { name: /definition of craft/i }));
    expect(screen.getByRole("tooltip").textContent).toContain("unit of work");
  });

  it("shows the rule summary and section for a known rule", async () => {
    const user = userEvent.setup();
    render(<TermHint rule="RULE-CRAFT-1" />);
    await user.hover(screen.getByRole("button", { name: /definition of rule-craft-1/i }));
    const tooltip = screen.getByRole("tooltip");
    expect(tooltip.textContent).toContain("unique and immutable");
    expect(tooltip.textContent).toContain("§2.1");
  });

  it("renders children unchanged when term is unknown", () => {
    render(<TermHint term="Nonexistent">label</TermHint>);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText("label")).toBeTruthy();
  });

  it("shows the tooltip on keyboard focus", async () => {
    const user = userEvent.setup();
    render(<TermHint term="Craft">Craft</TermHint>);
    await user.tab();
    expect(screen.getByRole("tooltip")).toBeTruthy();
  });
});
