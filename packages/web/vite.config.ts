import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const repoRoot = path.resolve(__dirname, "../..");

function getVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(path.resolve(__dirname, "package.json"), "utf-8"));
    return pkg.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

function getChangelog(): string {
  try {
    return readFileSync(path.resolve(__dirname, "CHANGELOG.md"), "utf-8");
  } catch {
    return "# Changelog\n\nNo changelog available.";
  }
}

interface Contributor {
  commits: number;
  name: string;
  email: string;
  username: string | null;
}

import {
  parseGlossary,
  parseRules,
  type GlossaryTerm,
  type RuleEntry,
} from "./src/lib/spec-parser.js";

function readSpec(): string {
  try {
    return readFileSync(path.join(repoRoot, "docs/specification.md"), "utf-8");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[vite] specification.md read failed: ${message}`);
    return "";
  }
}

function getGlossary(): GlossaryTerm[] {
  return parseGlossary(readSpec());
}

function getRules(): RuleEntry[] {
  return parseRules(readSpec());
}

function getContributors(): Contributor[] {
  const contributorsPath = path.join(repoRoot, "contributors.generated.json");

  // If the codegen output is missing, try to run the codegen script once.
  // Failures (missing `gh`, no network, etc.) are non-fatal — the about page
  // will just render an empty list.
  if (!existsSync(contributorsPath)) {
    try {
      execFileSync("pnpm", ["--filter", "@airtrafficcontrol/core", "codegen:contributors"], {
        cwd: repoRoot,
        stdio: "inherit",
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[vite] contributors codegen failed: ${message}`);
    }
  }

  try {
    const raw = readFileSync(contributorsPath, "utf-8");
    return JSON.parse(raw) as Contributor[];
  } catch {
    return [];
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    __ATC_VERSION__: JSON.stringify(getVersion()),
    __ATC_CHANGELOG__: JSON.stringify(getChangelog()),
    __ATC_CONTRIBUTORS__: JSON.stringify(getContributors()),
    __ATC_GLOSSARY__: JSON.stringify(getGlossary()),
    __ATC_RULES__: JSON.stringify(getRules()),
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:7700",
        changeOrigin: true,
      },
      "/ws": {
        target: "ws://localhost:7700",
        ws: true,
      },
    },
  },
});
