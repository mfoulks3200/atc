#!/usr/bin/env tsx
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

interface Contributor {
  commits: number;
  name: string;
  email: string;
  username: string | null;
}

const EXCLUDED_EMAILS = new Set<string>([
  "noreply@anthropic.com",
  "noreply@github.com",
  "actions@github.com",
  "41898282+github-actions[bot]@users.noreply.github.com",
  "49699333+dependabot[bot]@users.noreply.github.com",
]);

const EXCLUDED_USERNAMES = new Set<string>([
  "github-actions[bot]",
  "dependabot[bot]",
  "renovate[bot]",
  "claude",
  "claude[bot]",
]);

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

const run = (cmd: string, args: string[]): string =>
  execFileSync(cmd, args, { cwd: repoRoot, encoding: "utf8" }).trim();

const shortlog = run("git", ["shortlog", "-sne", "main"]);

const base: Omit<Contributor, "username">[] = shortlog
  .split("\n")
  .filter(Boolean)
  .map((line) => {
    const match = line.match(/^\s*(\d+)\s+(.+)\s+<([^>]+)>\s*$/);
    if (!match) throw new Error(`Unparseable shortlog line: ${line}`);
    return {
      commits: Number(match[1]),
      name: match[2],
      email: match[3],
    };
  });

const lookupUsername = (email: string): string | null => {
  const noreply = email.match(/^(?:\d+\+)?([^@]+)@users\.noreply\.github\.com$/);
  if (noreply) return noreply[1];
  try {
    const res = run("gh", [
      "api",
      `search/users?q=${encodeURIComponent(email)}+in:email`,
    ]);
    const parsed = JSON.parse(res) as { items?: Array<{ login: string }> };
    return parsed.items?.[0]?.login ?? null;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`Failed to resolve username for ${email}: ${message}`);
    return null;
  }
};

const enriched: Contributor[] = base
  .filter((c) => !EXCLUDED_EMAILS.has(c.email))
  .map((c) => ({ ...c, username: lookupUsername(c.email) }))
  .filter((c) => c.username === null || !EXCLUDED_USERNAMES.has(c.username))
  .sort((a, b) => b.commits - a.commits);

const outPath = resolve(repoRoot, "contributors.generated.json");
writeFileSync(outPath, JSON.stringify(enriched, null, 2) + "\n");
console.log(`Wrote ${enriched.length} contributors to ${outPath}`);
