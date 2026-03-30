import { describe, it, expect, beforeEach } from "vitest";
import { createOverrideStore } from "./overrides.js";
import { LifecycleEvent, ChecklistItemSeverity } from "@atc/types";
import type { CraftChecklistOverride } from "@atc/types";

describe("createOverrideStore", () => {
  let store: ReturnType<typeof createOverrideStore>;

  beforeEach(() => {
    store = createOverrideStore();
  });

  it("sets and retrieves an override", () => {
    const override: CraftChecklistOverride = {
      craftCallsign: "ATC-247",
      templateId: "tpl-1",
      event: LifecycleEvent.BeforeLandingCheck,
      addItems: [{ name: "Migration", severity: ChecklistItemSeverity.Required, executor: { type: "shell", command: "pnpm run migrate" } }],
    };
    store.set(override);
    const result = store.get("ATC-247", "tpl-1", LifecycleEvent.BeforeLandingCheck);
    expect(result).toEqual(override);
  });

  it("returns undefined for unknown override", () => {
    expect(store.get("ATC-247", "tpl-1", LifecycleEvent.BeforeTakeoff)).toBeUndefined();
  });

  it("overwrites existing override on set", () => {
    store.set({
      craftCallsign: "ATC-247",
      templateId: "tpl-1",
      event: LifecycleEvent.BeforeLandingCheck,
      disableTemplate: false,
    });
    store.set({
      craftCallsign: "ATC-247",
      templateId: "tpl-1",
      event: LifecycleEvent.BeforeLandingCheck,
      disableTemplate: true,
    });
    const result = store.get("ATC-247", "tpl-1", LifecycleEvent.BeforeLandingCheck);
    expect(result?.disableTemplate).toBe(true);
  });

  it("deletes an override", () => {
    store.set({
      craftCallsign: "ATC-247",
      templateId: "tpl-1",
      event: LifecycleEvent.BeforeLandingCheck,
    });
    const deleted = store.delete("ATC-247", "tpl-1", LifecycleEvent.BeforeLandingCheck);
    expect(deleted).toBe(true);
    expect(store.get("ATC-247", "tpl-1", LifecycleEvent.BeforeLandingCheck)).toBeUndefined();
  });

  it("lists overrides for a craft", () => {
    store.set({ craftCallsign: "ATC-247", templateId: "tpl-1", event: LifecycleEvent.BeforeLandingCheck });
    store.set({ craftCallsign: "ATC-247", templateId: "tpl-2", event: LifecycleEvent.BeforeTakeoff });
    store.set({ craftCallsign: "ATC-300", templateId: "tpl-1", event: LifecycleEvent.BeforeLandingCheck });
    const results = store.listForCraft("ATC-247");
    expect(results).toHaveLength(2);
  });
});
