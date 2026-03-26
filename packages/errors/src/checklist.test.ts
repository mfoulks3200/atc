import { describe, it, expect } from "vitest";
import { ChecklistError } from "./checklist.js";
import { AtcError } from "./base.js";

describe("ChecklistError", () => {
  it("extends AtcError", () => {
    const err = new ChecklistError("checklist item failed", "RULE-LCHK-3");
    expect(err).toBeInstanceOf(AtcError);
  });

  it("stores message and ruleId", () => {
    const err = new ChecklistError("not holding controls", "RULE-LCHK-1");
    expect(err.message).toBe("not holding controls");
    expect(err.ruleId).toBe("RULE-LCHK-1");
  });

  it("has name set to ChecklistError", () => {
    const err = new ChecklistError("msg", "RULE-LCHK-1");
    expect(err.name).toBe("ChecklistError");
  });
});
