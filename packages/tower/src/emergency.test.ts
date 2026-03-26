import { describe, it, expect } from "vitest";
import {
  CraftStatus,
  VectorStatus,
  ControlMode,
  BlackBoxEntryType,
} from "@atc/types";
import type { Craft, BlackBoxEntry } from "@atc/types";
import { createEmergencyReport } from "./emergency.js";

/** Helper: build a minimal valid craft for testing. */
function makeCraft(overrides: Partial<Craft> = {}): Craft {
  return {
    callsign: "TEST-1",
    branch: "feat/test-1",
    cargo: "Add widget endpoint",
    category: "Backend Engineering",
    captain: { identifier: "pilot-a", certifications: ["Backend Engineering"] },
    firstOfficers: [],
    jumpseaters: [],
    flightPlan: [
      {
        name: "Design",
        acceptanceCriteria: "Schema defined",
        status: VectorStatus.Passed,
      },
      {
        name: "Implement",
        acceptanceCriteria: "Endpoint works",
        status: VectorStatus.Failed,
      },
    ],
    blackBox: [
      {
        timestamp: new Date("2026-03-26T10:00:00Z"),
        author: "pilot-a",
        type: BlackBoxEntryType.Decision,
        content: "Chose REST over GraphQL",
      },
    ],
    controls: { mode: ControlMode.Exclusive, holder: "pilot-a" },
    status: CraftStatus.Emergency,
    ...overrides,
  };
}

describe("createEmergencyReport", () => {
  it("extracts callsign from the craft", () => {
    const craft = makeCraft({ callsign: "MAYDAY-7" });
    const report = createEmergencyReport(craft);
    expect(report.callsign).toBe("MAYDAY-7");
  });

  it("extracts cargo from the craft", () => {
    const craft = makeCraft({ cargo: "Fix auth bypass" });
    const report = createEmergencyReport(craft);
    expect(report.cargo).toBe("Fix auth bypass");
  });

  it("includes the complete flight plan", () => {
    const craft = makeCraft();
    const report = createEmergencyReport(craft);
    expect(report.flightPlan).toEqual(craft.flightPlan);
    expect(report.flightPlan).toHaveLength(2);
  });

  it("includes the complete black box (RULE-BBOX-4, RULE-ORIG-2)", () => {
    const craft = makeCraft();
    const report = createEmergencyReport(craft);
    expect(report.blackBox).toEqual(craft.blackBox);
    expect(report.blackBox).toHaveLength(1);
  });

  it("preserves flight plan vector order", () => {
    const craft = makeCraft();
    const report = createEmergencyReport(craft);
    expect(report.flightPlan[0].name).toBe("Design");
    expect(report.flightPlan[1].name).toBe("Implement");
  });

  it("handles a craft with an empty black box", () => {
    const craft = makeCraft({ blackBox: [] });
    const report = createEmergencyReport(craft);
    expect(report.blackBox).toEqual([]);
  });

  it("handles a craft with multiple black box entries", () => {
    const entries: BlackBoxEntry[] = [
      {
        timestamp: new Date("2026-03-26T10:00:00Z"),
        author: "pilot-a",
        type: BlackBoxEntryType.Decision,
        content: "First entry",
      },
      {
        timestamp: new Date("2026-03-26T11:00:00Z"),
        author: "pilot-a",
        type: BlackBoxEntryType.GoAround,
        content: "Second entry",
      },
      {
        timestamp: new Date("2026-03-26T12:00:00Z"),
        author: "pilot-a",
        type: BlackBoxEntryType.EmergencyDeclaration,
        content: "Third entry",
      },
    ];
    const craft = makeCraft({ blackBox: entries });
    const report = createEmergencyReport(craft);
    expect(report.blackBox).toHaveLength(3);
    expect(report.blackBox).toEqual(entries);
  });
});
