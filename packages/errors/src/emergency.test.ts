import { describe, it, expect } from "vitest";
import { EmergencyError } from "./emergency.js";
import { AtcError } from "./base.js";

describe("EmergencyError", () => {
  it("extends AtcError", () => {
    const err = new EmergencyError("non-captain declaring emergency", "RULE-EMER-1");
    expect(err).toBeInstanceOf(AtcError);
  });

  it("stores message and ruleId", () => {
    const err = new EmergencyError("missing declaration entry", "RULE-EMER-2");
    expect(err.message).toBe("missing declaration entry");
    expect(err.ruleId).toBe("RULE-EMER-2");
  });

  it("has name set to EmergencyError", () => {
    const err = new EmergencyError("msg", "RULE-EMER-1");
    expect(err.name).toBe("EmergencyError");
  });
});
