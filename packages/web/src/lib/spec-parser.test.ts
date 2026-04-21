import { describe, it, expect } from "vitest";
import { extractSection, parseGlossary, parseMarkdownTable, parseRules } from "./spec-parser.js";

const SAMPLE_SPEC = `# Spec

## 1. Overview

### 1.1 Terminology

| Aviation Term | Software Meaning |
| ------------- | ---------------- |
| Craft         | A unit of work.  |
| Vector        | A milestone.     |

## 2. Domain

### 2.1 Craft

Some prose that should not be captured.

## 5. Appendices

### Appendix A: Rule Index

| Rule ID      | Summary                              | Section |
| ------------ | ------------------------------------ | ------- |
| RULE-CRAFT-1 | Callsign must be unique.             | 2.1     |
| RULE-CTRL-2a | Control inserted rule.               | 2.2.4   |
| not-a-rule   | Should be filtered out.              | -       |

## 6. Footer
`;

describe("parseMarkdownTable", () => {
  it("returns rows excluding the header", () => {
    const rows = parseMarkdownTable("| a | b |\n| --- | --- |\n| 1 | 2 |\n| 3 | 4 |\n");
    expect(rows).toEqual([
      ["1", "2"],
      ["3", "4"],
    ]);
  });

  it("stops at the first non-table line after the table starts", () => {
    const rows = parseMarkdownTable("| a |\n| - |\n| 1 |\nprose\n| 2 |\n");
    expect(rows).toEqual([["1"]]);
  });

  it("returns empty when no table present", () => {
    expect(parseMarkdownTable("no table here")).toEqual([]);
  });
});

describe("extractSection", () => {
  it("extracts content until the next heading", () => {
    const section = extractSection(SAMPLE_SPEC, "### 1.1 Terminology");
    expect(section).toContain("Craft");
    expect(section).not.toContain("Domain");
  });

  it("returns empty string when the heading is missing", () => {
    expect(extractSection(SAMPLE_SPEC, "### Nope")).toBe("");
  });
});

describe("parseGlossary", () => {
  it("extracts terminology rows from the spec", () => {
    const entries = parseGlossary(SAMPLE_SPEC);
    expect(entries).toEqual([
      { term: "Craft", definition: "A unit of work." },
      { term: "Vector", definition: "A milestone." },
    ]);
  });
});

describe("parseRules", () => {
  it("parses rule ids, prefix, summary, and section", () => {
    const rules = parseRules(SAMPLE_SPEC);
    expect(rules).toHaveLength(2);
    expect(rules[0]).toEqual({
      id: "RULE-CRAFT-1",
      prefix: "CRAFT",
      summary: "Callsign must be unique.",
      section: "2.1",
    });
    expect(rules[1].prefix).toBe("CTRL");
    expect(rules[1].id).toBe("RULE-CTRL-2a");
  });

  it("skips rows without a RULE- id", () => {
    const rules = parseRules(SAMPLE_SPEC);
    expect(rules.find((r) => r.id === "not-a-rule")).toBeUndefined();
  });
});
