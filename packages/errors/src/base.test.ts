import { describe, it, expect } from "vitest";
import { AtcError } from "./base.js";

describe("AtcError", () => {
  it("extends Error", () => {
    const err = new AtcError("something broke", "RULE-TEST-1");
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(AtcError);
  });

  it("stores the message", () => {
    const err = new AtcError("something broke", "RULE-TEST-1");
    expect(err.message).toBe("something broke");
  });

  it("stores the ruleId", () => {
    const err = new AtcError("something broke", "RULE-TEST-1");
    expect(err.ruleId).toBe("RULE-TEST-1");
  });

  it("has name set to AtcError", () => {
    const err = new AtcError("msg", "RULE-TEST-1");
    expect(err.name).toBe("AtcError");
  });

  it("captures a stack trace", () => {
    const err = new AtcError("msg", "RULE-TEST-1");
    expect(err.stack).toBeDefined();
  });
});
