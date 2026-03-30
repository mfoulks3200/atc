import type { ChecklistItemDef, LifecycleEvent } from "@atc/types";
import type { createTemplateRegistry } from "./templates.js";
import type { createBindingRegistry } from "./bindings.js";
import type { createOverrideStore } from "./overrides.js";

/**
 * A resolved checklist ready for execution.
 */
export interface ResolvedChecklist {
  readonly templateId: string;
  readonly templateName: string;
  readonly items: readonly ChecklistItemDef[];
}

/**
 * Input for checklist resolution.
 */
export interface ResolveInput {
  readonly craftCallsign: string;
  readonly craftCategory: string;
  readonly event: LifecycleEvent;
  readonly templates: ReturnType<typeof createTemplateRegistry>;
  readonly bindings: ReturnType<typeof createBindingRegistry>;
  readonly overrides: ReturnType<typeof createOverrideStore>;
}

/**
 * Resolves the final checklist item list for a craft and event.
 *
 * Looks up bindings, fetches templates, applies overrides, and returns
 * an ordered list of resolved checklists ready for execution.
 *
 * @param input - The craft, event, and registries to resolve against.
 * @returns Ordered list of resolved checklists. Empty if no bindings match.
 * @see RULE-CHKL-2, RULE-CHKL-3, RULE-CHKL-7
 */
export function resolveChecklist(input: ResolveInput): readonly ResolvedChecklist[] {
  const { craftCallsign, craftCategory, event, templates, bindings, overrides } = input;

  const matchedBindings = bindings.findByEventAndCategory(event, craftCategory);
  const resolved: ResolvedChecklist[] = [];

  for (const binding of matchedBindings) {
    const override = overrides.get(craftCallsign, binding.templateId, event);

    if (override?.disableTemplate) continue;

    const template = templates.get(binding.templateId);
    if (!template) continue;

    let items = [...template.items];

    if (override?.removeItems) {
      const removeSet = new Set(override.removeItems);
      items = items.filter((item) => !removeSet.has(item.name));
    }

    if (override?.addItems) {
      items.push(...override.addItems);
    }

    resolved.push({
      templateId: template.id,
      templateName: template.name,
      items,
    });
  }

  return resolved;
}
