import { describe, it, expect } from "vitest";
import {
  buildSystemPrompt,
  deriveSeat,
  MAX_BLACK_BOX_ENTRIES,
  MAX_SYSTEM_PROMPT_TOKENS,
} from "./prompt-builder.js";
import { BlackBoxEntryType, CraftStatus } from "@airtrafficcontrol/types";
import type { BlackBoxEntry, CraftState } from "@airtrafficcontrol/daemon";

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

/** Craft with enough black box entries to push the prompt over the token budget. */
function largeCraft(blackBoxCount: number): CraftState {
  const entries: BlackBoxEntry[] = Array.from({ length: blackBoxCount }, (_, i) => ({
    timestamp: `2026-04-01T${String(i % 24).padStart(2, "0")}:00:00.000Z`,
    author: "pilot-001",
    type: BlackBoxEntryType.Observation,
    // Long content to reliably push past the 4-char/token budget.
    content: `Entry ${i}: ${"x".repeat(500)}`,
  }));
  return { ...baseCraft, blackBox: entries };
}

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

  it("includes craft base URL for read-only curl calls and MCP tool references for actions", () => {
    const prompt = buildSystemPrompt(
      baseCraft,
      "pilot-001",
      "demo-project",
      "http://atc.example:9100",
    );
    expect(prompt).toContain("http://atc.example:9100/api/v1/projects/demo-project/crafts/ALPHA-1");
    expect(prompt).not.toContain("http://localhost:7700");
    expect(prompt).toContain("/intercom");
    expect(prompt).toContain("/vectors");
    // Checklist and other mutating actions use MCP tools, not curl.
    expect(prompt).toContain("atc_craft_run_checklist");
    expect(prompt).not.toContain("/checklist");
  });

  it("instructs the agent to use atc_intercom_send for broadcasting", () => {
    const prompt = buildSystemPrompt(baseCraft, "pilot-002", "demo-project");
    expect(prompt).toContain("atc_intercom_send");
  });

  it("distinguishes private assistant output from the shared intercom channel", () => {
    const prompt = buildSystemPrompt(baseCraft, "pilot-001", "demo-project");
    expect(prompt).toContain("two separate communication channels");
    expect(prompt).toContain("private");
    expect(prompt).toContain("INTERCOM RECEIVED");
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

  it("includes a Recent Activity section", () => {
    const prompt = buildSystemPrompt(baseCraft, "pilot-001", "demo-project");
    expect(prompt).toContain("Recent Activity");
  });

  it("shows (no entries) in Recent Activity when blackBox is empty", () => {
    const prompt = buildSystemPrompt(baseCraft, "pilot-001", "demo-project");
    expect(prompt).toContain("(no entries)");
  });

  it("renders black box entries in Recent Activity when present", () => {
    const withBB: CraftState = {
      ...baseCraft,
      blackBox: [
        {
          timestamp: "2026-04-01T10:00:00.000Z",
          author: "pilot-001",
          type: BlackBoxEntryType.Decision,
          content: "Chose REST over GraphQL for simplicity",
        },
      ],
    };
    const prompt = buildSystemPrompt(withBB, "pilot-001", "demo-project");
    expect(prompt).toContain("Chose REST over GraphQL for simplicity");
    expect(prompt).toContain("Decision");
    expect(prompt).toContain("2026-04-01T10:00:00.000Z");
  });

  it("does not prepend a truncation notice when the prompt is within budget", () => {
    const prompt = buildSystemPrompt(baseCraft, "pilot-001", "demo-project");
    expect(prompt).not.toContain("[Context truncated:");
  });
});

describe("buildSystemPrompt — truncation", () => {
  it("prepends a truncation notice when the prompt exceeds MAX_SYSTEM_PROMPT_TOKENS", () => {
    const craft = largeCraft(30);
    const prompt = buildSystemPrompt(craft, "pilot-001", "demo-project");
    expect(prompt).toContain("[Context truncated:");
    expect(prompt).toContain("call atc_get_context for full state");
  });

  it("caps black box to the most recent MAX_BLACK_BOX_ENTRIES entries", () => {
    const craft = largeCraft(30);
    const prompt = buildSystemPrompt(craft, "pilot-001", "demo-project");
    // Only the last MAX_BLACK_BOX_ENTRIES entries should appear (Entry 20–29).
    expect(prompt).toContain("Entry 29:");
    expect(prompt).toContain("Entry 20:");
    expect(prompt).not.toContain("Entry 19:");
    expect(prompt).not.toContain("Entry 0:");
  });

  it("reports the correct number of omitted black box entries in the notice", () => {
    const count = 30;
    const craft = largeCraft(count);
    const prompt = buildSystemPrompt(craft, "pilot-001", "demo-project");
    const omitted = count - MAX_BLACK_BOX_ENTRIES;
    expect(prompt).toContain(`${omitted} black box entries`);
  });

  it("omits vector acceptance criteria in truncated mode", () => {
    const craft = largeCraft(30);
    const prompt = buildSystemPrompt(craft, "pilot-001", "demo-project");
    expect(prompt).not.toContain("POST /widgets returns 201");
    expect(prompt).not.toContain("Coverage >= 90%");
  });

  it("still includes vector names and statuses in truncated mode", () => {
    const craft = largeCraft(30);
    const prompt = buildSystemPrompt(craft, "pilot-001", "demo-project");
    expect(prompt).toContain("Implement widget API");
    expect(prompt).toContain("Write widget tests");
    expect(prompt).toContain("PENDING");
    expect(prompt).toContain("PASSED");
  });

  it("reports the correct number of omitted vector details in the notice", () => {
    const craft = largeCraft(30);
    const prompt = buildSystemPrompt(craft, "pilot-001", "demo-project");
    expect(prompt).toContain(`${craft.flightPlan.length} vector details omitted`);
  });

  it("does not truncate when black box is exactly at or below MAX_BLACK_BOX_ENTRIES", () => {
    // A small craft with MAX_BLACK_BOX_ENTRIES entries of normal size should not trigger truncation.
    const entries: BlackBoxEntry[] = Array.from({ length: MAX_BLACK_BOX_ENTRIES }, (_, i) => ({
      timestamp: `2026-04-01T${String(i).padStart(2, "0")}:00:00.000Z`,
      author: "pilot-001",
      type: BlackBoxEntryType.Observation,
      content: `Short entry ${i}`,
    }));
    const craft: CraftState = { ...baseCraft, blackBox: entries };
    const prompt = buildSystemPrompt(craft, "pilot-001", "demo-project");
    expect(prompt).not.toContain("[Context truncated:");
  });

  it("exports MAX_SYSTEM_PROMPT_TOKENS as 4000", () => {
    expect(MAX_SYSTEM_PROMPT_TOKENS).toBe(4000);
  });

  it("exports MAX_BLACK_BOX_ENTRIES as 10", () => {
    expect(MAX_BLACK_BOX_ENTRIES).toBe(10);
  });
});
