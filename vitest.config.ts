import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Resolve workspace packages from TypeScript source so tests run without a
// prior `pnpm run build`.  Vite processes .ts files directly and correctly
// follows the .js→.ts extension remapping required by Node16 module resolution.
function src(pkg: string): string {
  return fileURLToPath(new URL(`./packages/${pkg}/src/index.ts`, import.meta.url));
}

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./packages/web/src", import.meta.url)),
      "@airtrafficcontrol/types": src("types"),
      "@airtrafficcontrol/errors": src("errors"),
      "@airtrafficcontrol/validation": src("validation"),
      "@airtrafficcontrol/core": src("core"),
      "@airtrafficcontrol/checklist": src("checklist"),
      "@airtrafficcontrol/tower": src("tower"),
      "@airtrafficcontrol/adapter-claude-agent-sdk": src("adapter-claude-agent-sdk"),
    },
  },
  test: {
    globals: true,
    include: ["packages/*/src/**/*.test.ts", "packages/*/src/**/*.test.tsx"],
    // Use jsdom for web package tests; node for the rest.
    environmentMatchGlobs: [["packages/web/**", "jsdom"]],
    coverage: {
      provider: "v8",
    },
  },
});
