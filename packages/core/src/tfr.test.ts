import { describe, it, expect } from "vitest";
import { TfrScope, TfrMode, CraftStatus, ControlMode } from "@airtrafficcontrol/types";
import type { Craft } from "@airtrafficcontrol/types";
import {
  createTfr,
  liftTfr,
  isAffectedByTfr,
  getActiveTfrs,
  applyHoldingPattern,
  clearHoldingPattern,
} from "./tfr.js";
import type { CreateTfrParams } from "./tfr.js";

function validTfrParams(overrides: Partial<CreateTfrParams> = {}): CreateTfrParams {
  return {
    identifier: "tfr-1",
    scope: TfrScope.Global,
    target: null,
    mode: TfrMode.Graceful,
    reason: "System maintenance",
    issuedBy: "user",
    ...overrides,
  };
}

function makeCraft(overrides: Partial<Craft> = {}): Craft {
  return {
    callsign: "alpha-1",
    createdAt: new Date(),
    branch: "feat/alpha",
    cargo: "Build alpha",
    category: "Backend Engineering",
    captain: { identifier: "pilot-1", certifications: ["Backend Engineering"], selectionCount: 0 },
    firstOfficers: [],
    jumpseaters: [],
    flightPlan: [],
    blackBox: [],
    controls: { mode: ControlMode.Exclusive, holder: "pilot-1" },
    holdingPattern: false,
    status: CraftStatus.InFlight,
    ...overrides,
  };
}

describe("createTfr", () => {
  it("creates a global TFR with null target (RULE-TFR-1, RULE-TFR-2)", () => {
    const tfr = createTfr(validTfrParams());
    expect(tfr.identifier).toBe("tfr-1");
    expect(tfr.scope).toBe(TfrScope.Global);
    expect(tfr.target).toBeNull();
    expect(tfr.mode).toBe(TfrMode.Graceful);
    expect(tfr.reason).toBe("System maintenance");
    expect(tfr.issuedBy).toBe("user");
    expect(tfr.issuedAt).toBeInstanceOf(Date);
    expect(tfr.liftedAt).toBeNull();
  });

  it("creates a project-scoped TFR with project target (RULE-TFR-2)", () => {
    const tfr = createTfr(validTfrParams({ scope: TfrScope.Project, target: "my-project" }));
    expect(tfr.scope).toBe(TfrScope.Project);
    expect(tfr.target).toBe("my-project");
  });

  it("creates a craft-scoped TFR with callsign target (RULE-TFR-2)", () => {
    const tfr = createTfr(validTfrParams({ scope: TfrScope.Craft, target: "alpha-1" }));
    expect(tfr.scope).toBe(TfrScope.Craft);
    expect(tfr.target).toBe("alpha-1");
  });

  it("throws if project-scoped TFR has no target (RULE-TFR-2)", () => {
    expect(() => createTfr(validTfrParams({ scope: TfrScope.Project, target: null }))).toThrow();
  });

  it("throws if craft-scoped TFR has no target (RULE-TFR-2)", () => {
    expect(() => createTfr(validTfrParams({ scope: TfrScope.Craft, target: null }))).toThrow();
  });

  it("throws if global TFR has a non-null target (RULE-TFR-2)", () => {
    expect(() => createTfr(validTfrParams({ scope: TfrScope.Global, target: "oops" }))).toThrow();
  });

  it("throws if tower issues a global TFR (RULE-TFR-4)", () => {
    expect(() => createTfr(validTfrParams({ issuedBy: "tower" }))).toThrow();
  });

  it("allows tower to issue project-scoped TFR (RULE-TFR-4)", () => {
    const tfr = createTfr(
      validTfrParams({ scope: TfrScope.Project, target: "proj", issuedBy: "tower" }),
    );
    expect(tfr.issuedBy).toBe("tower");
  });

  it("allows tower to issue craft-scoped TFR (RULE-TFR-4)", () => {
    const tfr = createTfr(
      validTfrParams({ scope: TfrScope.Craft, target: "alpha-1", issuedBy: "tower" }),
    );
    expect(tfr.issuedBy).toBe("tower");
  });
});

describe("liftTfr", () => {
  it("sets liftedAt on an active TFR (RULE-TFRP-3)", () => {
    const tfr = createTfr(validTfrParams());
    const lifted = liftTfr(tfr);
    expect(lifted.liftedAt).toBeInstanceOf(Date);
    expect(lifted.identifier).toBe(tfr.identifier);
  });

  it("throws if TFR is already lifted", () => {
    const tfr = createTfr(validTfrParams());
    const lifted = liftTfr(tfr);
    expect(() => liftTfr(lifted)).toThrow();
  });
});

describe("isAffectedByTfr", () => {
  it("returns true for global TFR on any craft (RULE-TFR-7)", () => {
    const tfr = createTfr(validTfrParams());
    expect(isAffectedByTfr(tfr, "any-project", "any-callsign")).toBe(true);
  });

  it("returns true for project TFR matching the project", () => {
    const tfr = createTfr(validTfrParams({ scope: TfrScope.Project, target: "my-proj" }));
    expect(isAffectedByTfr(tfr, "my-proj", "any-callsign")).toBe(true);
  });

  it("returns false for project TFR not matching the project", () => {
    const tfr = createTfr(validTfrParams({ scope: TfrScope.Project, target: "my-proj" }));
    expect(isAffectedByTfr(tfr, "other-proj", "any-callsign")).toBe(false);
  });

  it("returns true for craft TFR matching the callsign", () => {
    const tfr = createTfr(validTfrParams({ scope: TfrScope.Craft, target: "alpha-1" }));
    expect(isAffectedByTfr(tfr, "any-project", "alpha-1")).toBe(true);
  });

  it("returns false for craft TFR not matching the callsign", () => {
    const tfr = createTfr(validTfrParams({ scope: TfrScope.Craft, target: "alpha-1" }));
    expect(isAffectedByTfr(tfr, "any-project", "bravo-1")).toBe(false);
  });

  it("returns false for a lifted TFR", () => {
    const tfr = liftTfr(createTfr(validTfrParams()));
    expect(isAffectedByTfr(tfr, "any-project", "any-callsign")).toBe(false);
  });
});

describe("getActiveTfrs", () => {
  it("returns only active (non-lifted) TFRs", () => {
    const active = createTfr(validTfrParams({ identifier: "tfr-1" }));
    const lifted = liftTfr(createTfr(validTfrParams({ identifier: "tfr-2" })));
    expect(getActiveTfrs([active, lifted])).toEqual([active]);
  });

  it("returns empty array when all TFRs are lifted", () => {
    const lifted = liftTfr(createTfr(validTfrParams()));
    expect(getActiveTfrs([lifted])).toEqual([]);
  });
});

describe("applyHoldingPattern", () => {
  it("sets holdingPattern to true on a craft (RULE-TFR-5)", () => {
    const craft = makeCraft({ holdingPattern: false });
    const held = applyHoldingPattern(craft);
    expect(held.holdingPattern).toBe(true);
    expect(held.status).toBe(craft.status);
  });

  it("does not alter craft lifecycle state (RULE-TFR-5)", () => {
    const craft = makeCraft({ status: CraftStatus.LandingChecklist });
    const held = applyHoldingPattern(craft);
    expect(held.status).toBe(CraftStatus.LandingChecklist);
  });
});

describe("clearHoldingPattern", () => {
  it("sets holdingPattern to false (RULE-TFR-8)", () => {
    const craft = makeCraft({ holdingPattern: true });
    const cleared = clearHoldingPattern(craft);
    expect(cleared.holdingPattern).toBe(false);
  });
});
