import { ChecklistItemSeverity } from "@airtrafficcontrol/types";
import type { ChecklistTemplate } from "@airtrafficcontrol/types";

/**
 * Default landing checklist template.
 *
 * Provides baseline validation for the `before:landing-check` event.
 * Projects should replace these placeholder commands with real ones.
 *
 * @see RULE-CHKL-1, RULE-CHKL-2
 */
export const DEFAULT_LANDING_TEMPLATE: ChecklistTemplate = {
  id: "default-landing-checklist",
  name: "Default Landing Checklist",
  description: "Built-in pre-landing validation checks.",
  items: [
    {
      name: "Tests",
      title: "Run Tests",
      description: "All test suites must pass before landing.",
      severity: ChecklistItemSeverity.Required,
      executor: { type: "shell", command: "pnpm run test" },
    },
    {
      name: "Lint",
      title: "Lint Check",
      description: "No lint errors allowed before landing.",
      severity: ChecklistItemSeverity.Required,
      executor: { type: "shell", command: "pnpm run lint" },
    },
    {
      name: "Documentation",
      title: "Documentation Check",
      description: "Required docs should be present and up to date.",
      severity: ChecklistItemSeverity.Advisory,
      executor: { type: "shell", command: "pnpm run docs:check" },
    },
    {
      name: "Build",
      title: "Build Project",
      description: "Project must build successfully before landing.",
      severity: ChecklistItemSeverity.Required,
      executor: { type: "shell", command: "pnpm run build" },
    },
  ],
};
