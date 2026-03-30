import type { CraftChecklistOverride, LifecycleEvent } from "@atc/types";

/**
 * Creates an in-memory override store.
 *
 * @returns Store with set, get, delete, and list operations.
 * @see RULE-CHKL-3
 */
export function createOverrideStore() {
  const overrides = new Map<string, CraftChecklistOverride>();

  function key(callsign: string, templateId: string, event: LifecycleEvent): string {
    return `${callsign}:${templateId}:${event}`;
  }

  return {
    set(override: CraftChecklistOverride): void {
      overrides.set(key(override.craftCallsign, override.templateId, override.event), override);
    },

    get(callsign: string, templateId: string, event: LifecycleEvent): CraftChecklistOverride | undefined {
      return overrides.get(key(callsign, templateId, event));
    },

    delete(callsign: string, templateId: string, event: LifecycleEvent): boolean {
      return overrides.delete(key(callsign, templateId, event));
    },

    listForCraft(callsign: string): readonly CraftChecklistOverride[] {
      return [...overrides.values()].filter((o) => o.craftCallsign === callsign);
    },
  };
}
