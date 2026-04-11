import { describe, it, expect } from "vitest";
import { ConfigValidationError, UnknownConfigKeyError } from "./config.js";
import { AtcError } from "./base.js";

describe("ConfigValidationError", () => {
  it("extends AtcError and carries the placeholder rule id", () => {
    const err = new ConfigValidationError("global", [
      { code: "invalid_type", path: ["defaultProfile"], message: "Expected string" },
    ]);
    expect(err).toBeInstanceOf(AtcError);
    expect(err).toBeInstanceOf(ConfigValidationError);
    expect(err.ruleId).toBe("RULE-CFG-1");
    expect(err.scope).toBe("global");
    expect(err.issues).toHaveLength(1);
    expect(err.message).toContain("defaultProfile");
  });

  it("accepts an explicit message override", () => {
    const err = new ConfigValidationError("profile", [], "custom message");
    expect(err.message).toBe("custom message");
    expect(err.scope).toBe("profile");
  });
});

describe("UnknownConfigKeyError", () => {
  it("extends AtcError, carries rule id, and reports scope + key", () => {
    const err = new UnknownConfigKeyError("global", "nope");
    expect(err).toBeInstanceOf(AtcError);
    expect(err).toBeInstanceOf(UnknownConfigKeyError);
    expect(err.ruleId).toBe("RULE-CFG-1");
    expect(err.scope).toBe("global");
    expect(err.key).toBe("nope");
    expect(err.message).toContain("nope");
  });
});
