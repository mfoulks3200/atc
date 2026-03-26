import { describe, it, expect } from "vitest";
import { CraftStatus, ControlMode, VectorStatus } from "@atc/types";
import type { Pilot, Vector } from "@atc/types";
import { createCraft } from "./craft.js";
import type { CreateCraftParams } from "./craft.js";

const certifiedPilot: Pilot = {
  identifier: "captain-1",
  certifications: ["Backend Engineering"],
};

const certifiedFO: Pilot = {
  identifier: "fo-1",
  certifications: ["Backend Engineering"],
};

const uncertifiedPilot: Pilot = {
  identifier: "observer-1",
  certifications: ["Frontend Engineering"],
};

const sampleVectors: Vector[] = [
  {
    name: "API Design",
    acceptanceCriteria: "REST endpoints defined",
    status: VectorStatus.Pending,
  },
  {
    name: "Tests",
    acceptanceCriteria: "90% coverage",
    status: VectorStatus.Pending,
  },
];

function validParams(overrides?: Partial<CreateCraftParams>): CreateCraftParams {
  return {
    callsign: "CRAFT-001",
    branch: "feat/craft-001",
    cargo: "Implement user authentication",
    category: "Backend Engineering",
    captain: certifiedPilot,
    flightPlan: sampleVectors,
    ...overrides,
  };
}

describe("createCraft", () => {
  it("creates a craft with all required properties", () => {
    const craft = createCraft(validParams());

    expect(craft.callsign).toBe("CRAFT-001");
    expect(craft.branch).toBe("feat/craft-001");
    expect(craft.cargo).toBe("Implement user authentication");
    expect(craft.category).toBe("Backend Engineering");
    expect(craft.captain).toBe(certifiedPilot);
  });

  it("sets initial status to Taxiing (RULE-LIFE-1)", () => {
    const craft = createCraft(validParams());

    expect(craft.status).toBe(CraftStatus.Taxiing);
  });

  it("creates an empty black box (RULE-BBOX-1)", () => {
    const craft = createCraft(validParams());

    expect(craft.blackBox).toEqual([]);
  });

  it("sets initial controls to captain in exclusive mode (RULE-CTRL-1)", () => {
    const craft = createCraft(validParams());

    expect(craft.controls.mode).toBe(ControlMode.Exclusive);
    expect(craft.controls.holder).toBe("captain-1");
  });

  it("assigns first officers when provided", () => {
    const craft = createCraft(validParams({ firstOfficers: [certifiedFO] }));

    expect(craft.firstOfficers).toHaveLength(1);
    expect(craft.firstOfficers[0].identifier).toBe("fo-1");
  });

  it("defaults first officers to empty array when not provided", () => {
    const craft = createCraft(validParams());

    expect(craft.firstOfficers).toEqual([]);
  });

  it("assigns jumpseaters when provided", () => {
    const craft = createCraft(validParams({ jumpseaters: [uncertifiedPilot] }));

    expect(craft.jumpseaters).toHaveLength(1);
    expect(craft.jumpseaters[0].identifier).toBe("observer-1");
  });

  it("defaults jumpseaters to empty array when not provided", () => {
    const craft = createCraft(validParams());

    expect(craft.jumpseaters).toEqual([]);
  });

  it("assigns the flight plan with all vectors in Pending status", () => {
    const craft = createCraft(validParams());

    expect(craft.flightPlan).toHaveLength(2);
    for (const vector of craft.flightPlan) {
      expect(vector.status).toBe(VectorStatus.Pending);
    }
  });

  it("throws CraftError when callsign is empty (RULE-CRAFT-1)", () => {
    expect(() => createCraft(validParams({ callsign: "" }))).toThrow();
  });

  it("throws CraftError when branch is empty (RULE-CRAFT-2)", () => {
    expect(() => createCraft(validParams({ branch: "" }))).toThrow();
  });

  it("throws CraftError when cargo is empty (RULE-CRAFT-3)", () => {
    expect(() => createCraft(validParams({ cargo: "" }))).toThrow();
  });

  it("throws CraftError when category is empty (RULE-CRAFT-4)", () => {
    expect(() => createCraft(validParams({ category: "" }))).toThrow();
  });

  it("throws CraftError when captain is not certified for the category (RULE-SEAT-2)", () => {
    expect(() => createCraft(validParams({ captain: uncertifiedPilot }))).toThrow();
  });

  it("throws CraftError when a first officer is not certified (RULE-SEAT-2)", () => {
    expect(() => createCraft(validParams({ firstOfficers: [uncertifiedPilot] }))).toThrow();
  });
});
