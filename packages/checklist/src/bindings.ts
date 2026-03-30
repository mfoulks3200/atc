import type { ChecklistBinding } from "@atc/types";
import type { LifecycleEvent } from "@atc/types";

/**
 * Creates an in-memory checklist binding registry.
 *
 * @returns Registry with create, find, list, and delete operations.
 * @see RULE-CHKL-2
 */
export function createBindingRegistry() {
  const bindings: ChecklistBinding[] = [];

  return {
    create(input: ChecklistBinding): ChecklistBinding {
      bindings.push(input);
      return input;
    },

    findByEventAndCategory(
      event: LifecycleEvent,
      craftCategory: string,
    ): readonly ChecklistBinding[] {
      return bindings.filter(
        (b) => b.event === event && (b.craftCategory === craftCategory || b.craftCategory === "*"),
      );
    },

    list(): readonly ChecklistBinding[] {
      return [...bindings];
    },

    delete(templateId: string, event: LifecycleEvent, craftCategory: string): boolean {
      const index = bindings.findIndex(
        (b) =>
          b.templateId === templateId && b.event === event && b.craftCategory === craftCategory,
      );
      if (index === -1) return false;
      bindings.splice(index, 1);
      return true;
    },
  };
}
