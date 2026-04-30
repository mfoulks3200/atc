import type { ChecklistBinding } from "@airtrafficcontrol/types";
import { LifecycleEvent } from "@airtrafficcontrol/types";

const VECTOR_EVENTS = new Set<string>([
  LifecycleEvent.BeforeVectorComplete,
  LifecycleEvent.AfterVectorComplete,
]);

/**
 * Creates an in-memory checklist binding registry.
 *
 * @returns Registry with create, find, list, and delete operations.
 * @see RULE-CHKL-2, RULE-CHKL-10
 */
export function createBindingRegistry() {
  const bindings: ChecklistBinding[] = [];

  return {
    create(input: ChecklistBinding): ChecklistBinding {
      bindings.push(input);
      return input;
    },

    /**
     * Finds bindings matching an event and craft category.
     *
     * When `vectorName` is provided and the event is a vector event, only bindings
     * that either have no `vectorName` (runs for all vectors) or match the given
     * `vectorName` are returned. For non-vector events, `vectorName` is ignored.
     *
     * @see RULE-CHKL-10
     */
    findByEventAndCategory(
      event: LifecycleEvent,
      craftCategory: string,
      vectorName?: string,
    ): readonly ChecklistBinding[] {
      return bindings.filter((b) => {
        if (b.event !== event) return false;
        if (b.craftCategory !== craftCategory && b.craftCategory !== "*") return false;

        // RULE-CHKL-10: vectorName filter only applies to vector events.
        if (VECTOR_EVENTS.has(event) && vectorName !== undefined) {
          return b.vectorName === undefined || b.vectorName === vectorName;
        }

        return true;
      });
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
