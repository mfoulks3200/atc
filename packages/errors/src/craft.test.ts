import { describe, it, expect } from "vitest";
import { CraftError } from "./craft.js";
import { AtcError } from "./base.js";

describe("CraftError", () => {
  it("extends AtcError", () => {
    const err = new CraftError("duplicate callsign", "RULE-CRAFT-1");
    expect(err).toBeInstanceOf(AtcError);
    expect(err).toBeInstanceOf(Error);
  });

  it("stores message and ruleId", () => {
    const err = new CraftError("missing captain", "RULE-CRAFT-5");
    expect(err.message).toBe("missing captain");
    expect(err.ruleId).toBe("RULE-CRAFT-5");
  });

  it("has name set to CraftError", () => {
    const err = new CraftError("msg", "RULE-CRAFT-1");
    expect(err.name).toBe("CraftError");
  });
});
