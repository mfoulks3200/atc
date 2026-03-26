import { describe, it, expect } from "vitest";
import { VectorError } from "./vector.js";
import { AtcError } from "./base.js";

describe("VectorError", () => {
  it("extends AtcError", () => {
    const err = new VectorError("skipped vector", "RULE-VEC-2");
    expect(err).toBeInstanceOf(AtcError);
  });

  it("stores message and ruleId", () => {
    const err = new VectorError("missing report", "RULE-VRPT-1");
    expect(err.message).toBe("missing report");
    expect(err.ruleId).toBe("RULE-VRPT-1");
  });

  it("has name set to VectorError", () => {
    const err = new VectorError("msg", "RULE-VEC-1");
    expect(err.name).toBe("VectorError");
  });
});
