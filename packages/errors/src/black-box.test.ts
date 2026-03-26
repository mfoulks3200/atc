import { describe, it, expect } from "vitest";
import { BlackBoxError } from "./black-box.js";
import { AtcError } from "./base.js";

describe("BlackBoxError", () => {
  it("extends AtcError", () => {
    const err = new BlackBoxError("mutating existing entry", "RULE-BBOX-2");
    expect(err).toBeInstanceOf(AtcError);
  });

  it("stores message and ruleId", () => {
    const err = new BlackBoxError("mutating existing entry", "RULE-BBOX-2");
    expect(err.message).toBe("mutating existing entry");
    expect(err.ruleId).toBe("RULE-BBOX-2");
  });

  it("has name set to BlackBoxError", () => {
    const err = new BlackBoxError("msg", "RULE-BBOX-1");
    expect(err.name).toBe("BlackBoxError");
  });
});
