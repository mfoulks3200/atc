import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./packages/web/src", import.meta.url)),
    },
  },
  test: {
    globals: true,
    include: ["packages/*/src/**/*.test.ts", "packages/*/src/**/*.test.tsx"],
    // Use jsdom for web package tests; node for the rest.
    environmentMatchGlobs: [["packages/web/**", "jsdom"]],
    coverage: {
      provider: "v8",
      thresholds: {
        statements: 90,
        branches: 90,
        functions: 90,
        lines: 90,
      },
    },
  },
});
