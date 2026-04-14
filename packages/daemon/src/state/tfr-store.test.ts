import { describe, it, expect, beforeEach } from "vitest";
import { TfrStore } from "./tfr-store.js";
import type { TfrState } from "../types.js";

function makeTfr(overrides: Partial<TfrState> = {}): TfrState {
  return {
    identifier: "tfr-1",
    scope: "global",
    target: null,
    mode: "graceful",
    reason: "maintenance",
    issuedBy: "user",
    issuedAt: new Date().toISOString(),
    liftedAt: null,
    ...overrides,
  };
}

describe("TfrStore", () => {
  let store: TfrStore;

  beforeEach(() => {
    store = new TfrStore("/tmp/atc-tfr-test");
  });

  it("stores and retrieves a TFR by identifier", () => {
    const tfr = makeTfr();
    store.set(tfr);
    expect(store.get("tfr-1")).toEqual(tfr);
  });

  it("returns undefined for unknown identifier", () => {
    expect(store.get("ghost")).toBeUndefined();
  });

  it("lists all TFRs", () => {
    store.set(makeTfr({ identifier: "tfr-1" }));
    store.set(makeTfr({ identifier: "tfr-2" }));
    expect(store.list()).toHaveLength(2);
  });

  it("lists only active TFRs", () => {
    store.set(makeTfr({ identifier: "tfr-1", liftedAt: null }));
    store.set(makeTfr({ identifier: "tfr-2", liftedAt: new Date().toISOString() }));
    expect(store.listActive()).toHaveLength(1);
    expect(store.listActive()[0].identifier).toBe("tfr-1");
  });

  it("finds active TFRs affecting a project and callsign", () => {
    store.set(makeTfr({ identifier: "tfr-global", scope: "global", target: null }));
    store.set(makeTfr({ identifier: "tfr-proj", scope: "project", target: "my-proj" }));
    store.set(makeTfr({ identifier: "tfr-craft", scope: "craft", target: "alpha-1" }));
    store.set(makeTfr({ identifier: "tfr-other", scope: "craft", target: "bravo-1" }));

    const affecting = store.findAffecting("my-proj", "alpha-1");
    const ids = affecting.map((t) => t.identifier).sort();
    expect(ids).toEqual(["tfr-craft", "tfr-global", "tfr-proj"]);
  });

  it("does not include lifted TFRs in findAffecting", () => {
    store.set(makeTfr({ identifier: "tfr-1", liftedAt: new Date().toISOString() }));
    expect(store.findAffecting("any", "any")).toEqual([]);
  });
});
