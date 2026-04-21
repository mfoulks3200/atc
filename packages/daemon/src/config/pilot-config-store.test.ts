import { describe, it, expect, vi } from "vitest";
import { UnknownConfigKeyError } from "@airtrafficcontrol/errors";
import { PilotConfigStore } from "./pilot-config-store.js";
import { PILOT_CONFIG_DEFAULTS } from "./schema.js";

describe("PilotConfigStore", () => {
  function makeStore() {
    const publish = vi.fn();
    const store = new PilotConfigStore(publish);
    return { store, publish };
  }

  it("returns defaults for an unknown pilot", () => {
    const { store } = makeStore();
    expect(store.get("pilot-1")).toEqual(PILOT_CONFIG_DEFAULTS);
  });

  it("returns empty overrides for an unknown pilot", () => {
    const { store } = makeStore();
    expect(store.getOverrides("pilot-1")).toEqual({});
  });

  it("patches config and publishes on correct channel", () => {
    const { store, publish } = makeStore();
    store.patch("pilot-1", { certifications: ["captain"] });
    const config = store.get("pilot-1");
    expect(config.certifications).toEqual(["captain"]);
    expect(config.mcpServers).toEqual({});
    expect(config.skills).toEqual([]);
    expect(publish).toHaveBeenCalledWith(
      "config:pilot:pilot-1",
      expect.objectContaining({ source: "api" }),
    );
  });

  it("replaces config entirely", () => {
    const { store, publish } = makeStore();
    store.patch("pilot-2", { certifications: ["first-officer"] });
    store.replace("pilot-2", {
      certifications: ["captain"],
      mcpServers: {},
      skills: ["fly"],
    });
    const config = store.get("pilot-2");
    expect(config.certifications).toEqual(["captain"]);
    expect(config.skills).toEqual(["fly"]);
    expect(publish).toHaveBeenCalledTimes(2);
    expect(publish).toHaveBeenLastCalledWith(
      "config:pilot:pilot-2",
      expect.objectContaining({ source: "api" }),
    );
  });

  it("unsets a key, reverting it to default", () => {
    const { store } = makeStore();
    store.patch("pilot-3", { certifications: ["jumpseat"], skills: ["observe"] });
    store.unset("pilot-3", "certifications");
    const config = store.get("pilot-3");
    expect(config.certifications).toEqual([]);
    // skills override preserved
    expect(config.skills).toEqual(["observe"]);
  });

  it("throws UnknownConfigKeyError when unsetting an unknown key", () => {
    const { store } = makeStore();
    expect(() =>
      store.unset("pilot-4", "nonExistentKey" as keyof typeof PILOT_CONFIG_DEFAULTS),
    ).toThrow(UnknownConfigKeyError);
  });

  it("removes all overrides for a pilot", () => {
    const { store } = makeStore();
    store.patch("pilot-5", { certifications: ["captain"] });
    store.remove("pilot-5");
    expect(store.get("pilot-5")).toEqual(PILOT_CONFIG_DEFAULTS);
    expect(store.getOverrides("pilot-5")).toEqual({});
  });
});
