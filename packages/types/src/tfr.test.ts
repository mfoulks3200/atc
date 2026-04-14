import { describe, it, expect } from "vitest";
import { TfrScope, TfrMode } from "./tfr.js";

describe("TfrScope", () => {
  it("has exactly 3 scope levels", () => {
    expect(Object.values(TfrScope)).toHaveLength(3);
  });

  it("contains all scope levels (RULE-TFR-2)", () => {
    expect(TfrScope.Global).toBe("Global");
    expect(TfrScope.Project).toBe("Project");
    expect(TfrScope.Craft).toBe("Craft");
  });
});

describe("TfrMode", () => {
  it("has exactly 2 modes", () => {
    expect(Object.values(TfrMode)).toHaveLength(2);
  });

  it("contains all modes (RULE-TFRP-1, RULE-TFRP-2)", () => {
    expect(TfrMode.Graceful).toBe("Graceful");
    expect(TfrMode.Immediate).toBe("Immediate");
  });
});
