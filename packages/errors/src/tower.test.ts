import { describe, it, expect } from "vitest";
import { TowerError } from "./tower.js";
import { AtcError } from "./base.js";

describe("TowerError", () => {
  it("extends AtcError", () => {
    const err = new TowerError("branch not up to date", "RULE-TOWER-3");
    expect(err).toBeInstanceOf(AtcError);
  });

  it("stores message and ruleId", () => {
    const err = new TowerError("unverified vector reports", "RULE-TMRG-1");
    expect(err.message).toBe("unverified vector reports");
    expect(err.ruleId).toBe("RULE-TMRG-1");
  });

  it("has name set to TowerError", () => {
    const err = new TowerError("msg", "RULE-TOWER-1");
    expect(err.name).toBe("TowerError");
  });
});
