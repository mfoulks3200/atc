import { describe, it, expect } from "vitest";
import { LifecycleError } from "./lifecycle.js";
import { AtcError } from "./base.js";

describe("LifecycleError", () => {
  it("extends AtcError", () => {
    const err = new LifecycleError("invalid transition", "RULE-LIFE-2");
    expect(err).toBeInstanceOf(AtcError);
  });

  it("stores message and ruleId", () => {
    const err = new LifecycleError("invalid transition", "RULE-LIFE-2");
    expect(err.message).toBe("invalid transition");
    expect(err.ruleId).toBe("RULE-LIFE-2");
  });

  it("has name set to LifecycleError", () => {
    const err = new LifecycleError("msg", "RULE-LIFE-1");
    expect(err.name).toBe("LifecycleError");
  });

  it("optionally stores from and to states", () => {
    const err = new LifecycleError("invalid transition", "RULE-LIFE-2", {
      from: "Landed",
      to: "InFlight",
    });
    expect(err.from).toBe("Landed");
    expect(err.to).toBe("InFlight");
  });

  it("defaults from and to to undefined", () => {
    const err = new LifecycleError("msg", "RULE-LIFE-1");
    expect(err.from).toBeUndefined();
    expect(err.to).toBeUndefined();
  });
});
