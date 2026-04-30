/**
 * Daemon-side implementation of the tower's ClearanceChecklistRunner interface.
 *
 * Resolves and executes all checklists bound to the `before:tower-clearance` event
 * for a given craft, using the project's in-memory template / binding / override
 * registries together with the shared `@airtrafficcontrol/checklist` runner.
 *
 * @see RULE-CHKL-13 — tower executes before:tower-clearance checklists during clearance
 * @see RULE-TMRG-5  — run after vector check, before queue insert
 */

import { runChecklist, resolveChecklist } from "@airtrafficcontrol/checklist";
import { LifecycleEvent } from "@airtrafficcontrol/types";
import type { ChecklistRunResult } from "@airtrafficcontrol/types";
import type { ClearanceChecklistRunner } from "@airtrafficcontrol/tower";
import type { ProjectChecklistRegistries } from "./app.js";

/**
 * Concrete implementation of {@link ClearanceChecklistRunner} for the daemon.
 *
 * Delegates to {@link resolveChecklist} (binding resolution) and
 * {@link runChecklist} (item execution) from the shared checklist package.
 *
 * @see RULE-CHKL-13
 * @see RULE-TMRG-5
 */
export class DaemonClearanceChecklistRunner implements ClearanceChecklistRunner {
  private readonly _registries: ProjectChecklistRegistries;

  /**
   * @param registries - The per-project template, binding, and override registries.
   */
  constructor(registries: ProjectChecklistRegistries) {
    this._registries = registries;
  }

  /**
   * Resolve and run all checklists bound to `before:tower-clearance` for the craft.
   *
   * @param craftCallsign - Callsign of the requesting craft.
   * @param craftCategory - Category of the requesting craft (for binding resolution).
   * @returns Per-template results in binding registration order. Empty array when no
   *   bindings are registered for this event/category combination.
   * @see RULE-CHKL-13
   */
  async runClearanceChecklists(
    craftCallsign: string,
    craftCategory: string,
  ): Promise<readonly ChecklistRunResult[]> {
    const resolved = resolveChecklist({
      craftCallsign,
      craftCategory,
      event: LifecycleEvent.BeforeTowerClearance,
      templates: this._registries.templates,
      bindings: this._registries.bindings,
      overrides: this._registries.overrides,
    });

    if (resolved.length === 0) return [];

    const results: ChecklistRunResult[] = [];
    for (const checklist of resolved) {
      const result = await runChecklist({
        checklistName: checklist.templateName,
        event: LifecycleEvent.BeforeTowerClearance,
        craftCallsign,
        attempt: 1,
        items: checklist.items,
      });
      results.push(result);
    }

    return results;
  }
}
