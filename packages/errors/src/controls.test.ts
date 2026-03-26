import { describe, it, expect } from "vitest";
import { ControlsError } from "./controls.js";
import { AtcError } from "./base.js";

describe("ControlsError", () => {
  it("extends AtcError", () => {
    const err = new ControlsError("jumpseat holding controls", "RULE-CTRL-2");
    expect(err).toBeInstanceOf(AtcError);
  });

  it("stores message and ruleId", () => {
    const err = new ControlsError("modifying without controls", "RULE-CTRL-3");
    expect(err.message).toBe("modifying without controls");
    expect(err.ruleId).toBe("RULE-CTRL-3");
  });

  it("has name set to ControlsError", () => {
    const err = new ControlsError("msg", "RULE-CTRL-1");
    expect(err.name).toBe("ControlsError");
  });
});
