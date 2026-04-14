export interface GlossaryTerm {
  term: string;
  definition: string;
}

export interface RuleEntry {
  id: string;
  prefix: string;
  summary: string;
  section: string;
}

export function parseMarkdownTable(source: string): string[][] {
  const lines = source.split("\n");
  const rows: string[][] = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line.startsWith("|")) {
      if (rows.length > 0) break;
      continue;
    }
    const cells = line
      .slice(1, line.endsWith("|") ? -1 : undefined)
      .split("|")
      .map((c) => c.trim());
    if (cells.every((c) => /^-+:?$|^:?-+:?$|^$/.test(c))) continue;
    rows.push(cells);
  }
  return rows.length > 1 ? rows.slice(1) : [];
}

export function extractSection(spec: string, heading: string): string {
  const idx = spec.indexOf(heading);
  if (idx === -1) return "";
  const after = spec.slice(idx + heading.length);
  const next = after.search(/\n#{1,6} /);
  return next === -1 ? after : after.slice(0, next);
}

export function parseGlossary(spec: string): GlossaryTerm[] {
  const section = extractSection(spec, "### 1.1 Terminology");
  return parseMarkdownTable(section)
    .filter((row) => row.length >= 2 && row[0] && row[1])
    .map(([term, definition]) => ({ term, definition }));
}

export function parseRules(spec: string): RuleEntry[] {
  const section = extractSection(spec, "### Appendix A: Rule Index");
  return parseMarkdownTable(section)
    .filter((row) => row.length >= 3 && /^RULE-/.test(row[0]))
    .map(([id, summary, section]) => {
      const match = /^RULE-([A-Z]+)-/.exec(id);
      return {
        id,
        prefix: match ? match[1] : "",
        summary,
        section: section ?? "",
      };
    });
}
