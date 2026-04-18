import { describe, it, expect } from "vitest";
import { buildSystemPrompt, deriveSeat } from "./prompt-builder.js";
import { CraftStatus } from "@airtrafficcontrol/types";
import type { CraftState } from "@airtrafficcontrol/daemon";

const baseCraft: CraftState = {
  callsign: "ALPHA-1",
  createdAt: "2026-04-11T00:00:00.000Z",
  branch: "feature/alpha-1",
  cargo: "Add widget support",
  category: "backend",
  status: CraftStatus.InFlight,
  holdingPattern: false,
  captain: "pilot-001",
  firstOfficers: ["pilot-002"],
  jumpseaters: ["pilot-003"],
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

describe("deriveSeat", () => {
  it("returns 'captain' for the captain pilotId", () => {
    expect(deriveSeat(baseCraft, "pilot-001")).toBe("captain");
  });

  it("returns 'firstOfficer' for a listed first officer", () => {
    expect(deriveSeat(baseCraft, "pilot-002")).toBe("firstOfficer");
  });

  it("returns 'jumpseat' for anyone else", () => {
    expect(deriveSeat(baseCraft, "pilot-003")).toBe("jumpseat");
    expect(deriveSeat(baseCraft, "pilot-unknown")).toBe("jumpseat");
  });
});

describe("buildSystemPrompt", () => {
  it("includes the craft callsign", () => {
    const prompt = buildSystemPrompt(baseCraft, "pilot-001", "demo-project");
    expect(prompt).toContain("ALPHA-1");
  });

  it("includes the craft cargo", () => {
    const prompt = buildSystemPrompt(baseCraft, "pilot-001", "demo-project");
    expect(prompt).toContain("Add widget support");
  });

  it("includes the project name", () => {
    const prompt = buildSystemPrompt(baseCraft, "pilot-001", "demo-project");
    expect(prompt).toContain("demo-project");
  });

  it("includes the pilot ID", () => {
    const prompt = buildSystemPrompt(baseCraft, "pilot-001", "demo-project");
    expect(prompt).toContain("pilot-001");
  });

  it("labels the pilot as Captain when they are the captain", () => {
    const prompt = buildSystemPrompt(baseCraft, "pilot-001", "demo-project");
    expect(prompt).toContain("Captain");
    expect(prompt).toContain("pilot-in-command");
  });

  it("labels the pilot as First Officer when they are a first officer", () => {
    const prompt = buildSystemPrompt(baseCraft, "pilot-002", "demo-project");
    expect(prompt).toContain("First Officer");
    expect(prompt).toContain("certified co-pilot");
  });

  it("labels the pilot as Jumpseat for observers", () => {
    const prompt = buildSystemPrompt(baseCraft, "pilot-003", "demo-project");
    expect(prompt).toContain("Jumpseat");
    expect(prompt).toContain("observer and advisor");
  });

  it("marks the caller with (you) in the crew list", () => {
    const prompt = buildSystemPrompt(baseCraft, "pilot-001", "demo-project");
    expect(prompt).toContain("pilot-001 (you)");
    expect(prompt).not.toContain("pilot-002 (you)");
  });

  it("includes flight plan vector names", () => {
    const prompt = buildSystemPrompt(baseCraft, "pilot-001", "demo-project");
    expect(prompt).toContain("Implement widget API");
    expect(prompt).toContain("Write widget tests");
  });

  it("includes vector acceptance criteria", () => {
    const prompt = buildSystemPrompt(baseCraft, "pilot-001", "demo-project");
    expect(prompt).toContain("POST /widgets returns 201");
    expect(prompt).toContain("Coverage >= 90%");
  });

  it("tags vector statuses correctly", () => {
    const prompt = buildSystemPrompt(baseCraft, "pilot-001", "demo-project");
    expect(prompt).toContain("PENDING");
    expect(prompt).toContain("PASSED");
  });

  it("identifies the next pending vector", () => {
    const prompt = buildSystemPrompt(baseCraft, "pilot-001", "demo-project");
    expect(prompt).toContain('Work on vector "Implement widget API"');
  });

  it("notes when all vectors are passed", () => {
    const allPassed: CraftState = {
      ...baseCraft,
      flightPlan: baseCraft.flightPlan.map((v) => ({ ...v, status: "Passed" as const })),
    };
    const prompt = buildSystemPrompt(allPassed, "pilot-001", "demo-project");
    expect(prompt).toContain("All vectors passed");
  });

  it("includes controls state", () => {
    const prompt = buildSystemPrompt(baseCraft, "pilot-001", "demo-project");
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
    const prompt = buildSystemPrompt(sharedCraft, "pilot-002", "demo-project");
    expect(prompt).toContain("Shared");
    expect(prompt).toContain("src/widgets");
  });

  it("handles an empty flight plan gracefully", () => {
    const emptyCraft: CraftState = { ...baseCraft, flightPlan: [] };
    const prompt = buildSystemPrompt(emptyCraft, "pilot-001", "demo-project");
    expect(prompt).toContain("no vectors defined");
  });

  it("includes API reference with correct URLs", () => {
    const prompt = buildSystemPrompt(baseCraft, "pilot-001", "demo-project");
    expect(prompt).toContain("http://localhost:7700/api/v1/projects/demo-project/crafts/ALPHA-1");
    expect(prompt).toContain("/intercom");
    expect(prompt).toContain("/vectors");
    expect(prompt).toContain("/checklist");
  });

  it("shows the pilot's own id as the intercom from field", () => {
    const prompt = buildSystemPrompt(baseCraft, "pilot-002", "demo-project");
    expect(prompt).toContain('"from":"pilot-002"');
  });

  it("includes intercom etiquette 3W principle", () => {
    const prompt = buildSystemPrompt(baseCraft, "pilot-001", "demo-project");
    expect(prompt).toContain("3W Principle");
    expect(prompt).toContain("Who you are calling");
    expect(prompt).toContain("Who you are");
    expect(prompt).toContain("What you want");
  });

  it("includes TFR handling instructions", () => {
    const prompt = buildSystemPrompt(baseCraft, "pilot-001", "demo-project");
    expect(prompt).toContain("TFR");
    expect(prompt).toContain("holdingPattern");
    expect(prompt).toContain("stop all activity");
  });

  it("warns when holding pattern is already active", () => {
    const heldCraft: CraftState = { ...baseCraft, holdingPattern: true };
    const prompt = buildSystemPrompt(heldCraft, "pilot-001", "demo-project");
    expect(prompt).toContain("YES — do not act until lifted");
  });

  it("includes black box discipline guidance", () => {
    const prompt = buildSystemPrompt(baseCraft, "pilot-001", "demo-project");
    expect(prompt).toContain("black box");
    expect(prompt).toContain("append-only");
  });
});
