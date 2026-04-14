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

export const GLOSSARY: readonly GlossaryTerm[] = __ATC_GLOSSARY__;
export const RULES: readonly RuleEntry[] = __ATC_RULES__;

const termIndex = new Map<string, GlossaryTerm>(
  GLOSSARY.map((entry) => [normalizeTerm(entry.term), entry]),
);

const ruleIndex = new Map<string, RuleEntry>(RULES.map((entry) => [entry.id, entry]));

function normalizeTerm(term: string): string {
  return term.toLowerCase().replace(/\s+/g, " ").trim();
}

export function findTerm(term: string): GlossaryTerm | undefined {
  return termIndex.get(normalizeTerm(term));
}

export function findRule(id: string): RuleEntry | undefined {
  return ruleIndex.get(id);
}

export function groupRulesByPrefix(
  rules: readonly RuleEntry[] = RULES,
): Array<{ prefix: string; rules: RuleEntry[] }> {
  const groups = new Map<string, RuleEntry[]>();
  for (const rule of rules) {
    const list = groups.get(rule.prefix) ?? [];
    list.push(rule);
    groups.set(rule.prefix, list);
  }
  return Array.from(groups.entries())
    .map(([prefix, rules]) => ({ prefix, rules }))
    .sort((a, b) => a.prefix.localeCompare(b.prefix));
}
