import { createChecklistItem } from "./runner.js";
import type { ChecklistItem } from "./types.js";

/**
 * Creates the default landing checklist with placeholder validators.
 *
 * The four default checks correspond to the spec's default checklist
 * (Section 4.2). Each placeholder always passes — projects override
 * these with real implementations.
 *
 * @returns A frozen array of the 4 default checklist items.
 * @see RULE-LCHK-4 — the checklist is project-configurable.
 */
export function createDefaultChecklist(): readonly ChecklistItem[] {
  const defaults: readonly ChecklistItem[] = [
    createChecklistItem("Tests", async () => ({
      name: "Tests",
      passed: true,
      message: "Placeholder — all test suites pass.",
    })),
    createChecklistItem("Lint", async () => ({
      name: "Lint",
      passed: true,
      message: "Placeholder — no lint errors or warnings.",
    })),
    createChecklistItem("Documentation", async () => ({
      name: "Documentation",
      passed: true,
      message: "Placeholder — required docs are present and up to date.",
    })),
    createChecklistItem("Build", async () => ({
      name: "Build",
      passed: true,
      message: "Placeholder — project builds successfully.",
    })),
  ];

  return Object.freeze(defaults);
}
