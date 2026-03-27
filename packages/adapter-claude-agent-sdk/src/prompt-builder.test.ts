import { describe, it, expect } from "vitest";
import { buildSystemPrompt } from "./prompt-builder.js";
import { CraftStatus } from "@atc/types";
import type { CraftState } from "@atc/daemon";

const baseCraft: CraftState = {
  callsign: "ALPHA-1",
  branch: "feature/alpha-1",
  cargo: "Add widget support",
  category: "backend",
  status: CraftStatus.InFlight,
  captain: "pilot-001",
  firstOfficers: [],
  jumpseaters: [],
  flightPlan: [
    {
      name: "Implement widget API",
      acceptanceCriteria: "POST /widgets returns 201",
      status: "Pending",
    },
    {
      name: "Write widget tests",
      acceptanceCriteria: "Coverage >= 90%",
      status: "Passed",
      evidence: "vitest run passed",
    },
  ],
  blackBox: [],
  intercom: [],
  controls: {
    mode: "exclusive",
    holder: "pilot-001",
  },
};

describe("buildSystemPrompt", () => {
  it("includes the craft callsign", () => {
    const prompt = buildSystemPrompt(baseCraft, "pilot-001", "captain");
    expect(prompt).toContain("ALPHA-1");
  });

  it("includes the craft cargo", () => {
    const prompt = buildSystemPrompt(baseCraft, "pilot-001", "captain");
    expect(prompt).toContain("Add widget support");
  });

  it("includes the pilot ID and seat", () => {
    const prompt = buildSystemPrompt(baseCraft, "pilot-001", "captain");
    expect(prompt).toContain("pilot-001");
    expect(prompt).toContain("captain");
  });

  it("includes flight plan vector names", () => {
    const prompt = buildSystemPrompt(baseCraft, "pilot-001", "captain");
    expect(prompt).toContain("Implement widget API");
    expect(prompt).toContain("Write widget tests");
  });

  it("includes vector acceptance criteria", () => {
    const prompt = buildSystemPrompt(baseCraft, "pilot-001", "captain");
    expect(prompt).toContain("POST /widgets returns 201");
    expect(prompt).toContain("Coverage >= 90%");
  });

  it("tags vector statuses correctly", () => {
    const prompt = buildSystemPrompt(baseCraft, "pilot-001", "captain");
    expect(prompt).toContain("[PENDING]");
    expect(prompt).toContain("[PASSED]");
  });

  it("includes controls state", () => {
    const prompt = buildSystemPrompt(baseCraft, "pilot-001", "captain");
    expect(prompt).toContain("Exclusive");
    expect(prompt).toContain("pilot-001");
  });

  it("handles shared controls mode", () => {
    const sharedCraft: CraftState = {
      ...baseCraft,
      controls: {
        mode: "shared",
        sharedAreas: [
          { pilotId: "pilot-002", area: "src/widgets" },
          { pilotId: "pilot-003", area: "tests/" },
        ],
      },
    };
    const prompt = buildSystemPrompt(sharedCraft, "pilot-002", "firstOfficer");
    expect(prompt).toContain("Shared");
    expect(prompt).toContain("pilot-002");
    expect(prompt).toContain("src/widgets");
  });

  it("handles an empty flight plan gracefully", () => {
    const emptyCraft: CraftState = { ...baseCraft, flightPlan: [] };
    const prompt = buildSystemPrompt(emptyCraft, "pilot-001", "captain");
    expect(prompt).toContain("no vectors defined");
  });
});
