import { describe, it, expectTypeOf } from "vitest";
import type {
  SpecDocument,
  SpecVector,
  SpecVectorCommand,
  SpecPilotHints,
  SddErrorCode,
  SpecPriority,
} from "./sdd.js";

describe("SpecVector", () => {
  it("accepts vector with criteria", () => {
    const v: SpecVector = { name: "Setup DB", criteria: ["migration runs without error"] };
    expectTypeOf(v.name).toBeString();
    expectTypeOf(v.criteria).toEqualTypeOf<string[] | undefined>();
  });

  it("accepts vector with command", () => {
    const v: SpecVector = { name: "Run tests", command: { run: "pnpm test" } };
    expectTypeOf(v.name).toBeString();
    expectTypeOf(v.command).toEqualTypeOf<SpecVectorCommand | null | undefined>();
  });

  it("accepts vector with both criteria and command", () => {
    const v: SpecVector = {
      name: "Verify endpoint",
      criteria: ["returns 200 OK"],
      command: { run: "curl -s http://localhost:3000/health", severity: "advisory" },
    };
    expectTypeOf(v.criteria).toEqualTypeOf<string[] | undefined>();
    expectTypeOf(v.command).toEqualTypeOf<SpecVectorCommand | null | undefined>();
  });
});

describe("SpecVectorCommand", () => {
  it("requires run field", () => {
    const cmd: SpecVectorCommand = { run: "pnpm test" };
    expectTypeOf(cmd.run).toBeString();
  });

  it("accepts optional timeout and severity", () => {
    const cmd: SpecVectorCommand = { run: "pnpm test", timeout: 60000, severity: "advisory" };
    expectTypeOf(cmd.timeout).toEqualTypeOf<number | undefined>();
    expectTypeOf(cmd.severity).toEqualTypeOf<"required" | "advisory" | undefined>();
  });
});

describe("SpecPilotHints", () => {
  it("all fields are optional", () => {
    const hints: SpecPilotHints = {};
    expectTypeOf(hints.captain).toEqualTypeOf<string | undefined>();
    expectTypeOf(hints.firstOfficers).toEqualTypeOf<string[] | undefined>();
    expectTypeOf(hints.jumpseaters).toEqualTypeOf<string[] | undefined>();
    expectTypeOf(hints.requireCertifications).toEqualTypeOf<string[] | undefined>();
    expectTypeOf(hints.exclude).toEqualTypeOf<string[] | undefined>();
  });

  it("accepts fully populated hints", () => {
    const hints: SpecPilotHints = {
      captain: "pilot-1",
      firstOfficers: ["pilot-2"],
      jumpseaters: ["pilot-3"],
      requireCertifications: ["security"],
      exclude: ["pilot-4"],
    };
    expectTypeOf(hints.captain).toEqualTypeOf<string | undefined>();
  });
});

describe("SpecDocument", () => {
  it("requires title, cargo, category, and vectors", () => {
    const doc: SpecDocument = {
      title: "Add OAuth2",
      cargo: "Implement OAuth2 login flow",
      category: "Backend Engineering",
      vectors: [{ name: "Token endpoint", criteria: ["returns JWT on valid credentials"] }],
    };
    expectTypeOf(doc.title).toBeString();
    expectTypeOf(doc.cargo).toBeString();
    expectTypeOf(doc.vectors).toEqualTypeOf<SpecVector[]>();
  });

  it("optional fields are correctly typed", () => {
    const doc: SpecDocument = {
      title: "Test",
      cargo: "Test cargo",
      category: "Documentation",
      vectors: [{ name: "v1", criteria: ["c1"] }],
      priority: "high",
      autoLaunch: true,
      callsignOverride: "my-callsign",
      pilots: { captain: "pilot-1" },
      notes: "Some notes",
      metadata: { key: "value" },
    };
    expectTypeOf(doc.priority).toEqualTypeOf<SpecPriority | undefined>();
    expectTypeOf(doc.autoLaunch).toEqualTypeOf<boolean | undefined>();
    expectTypeOf(doc.callsignOverride).toEqualTypeOf<string | null | undefined>();
    expectTypeOf(doc.notes).toEqualTypeOf<string | null | undefined>();
    expectTypeOf(doc.metadata).toEqualTypeOf<Record<string, string> | undefined>();
  });

  it("callsignOverride can be null", () => {
    const doc: SpecDocument = {
      title: "Test",
      cargo: "c",
      category: "Documentation",
      vectors: [{ name: "v", criteria: ["c"] }],
      callsignOverride: null,
    };
    expectTypeOf(doc.callsignOverride).toEqualTypeOf<string | null | undefined>();
  });
});

describe("SddErrorCode", () => {
  it("accepts all 9 valid error codes", () => {
    const codes: SddErrorCode[] = [
      "SPEC_PARSE_ERROR",
      "SPEC_VALIDATION_ERROR",
      "UNKNOWN_CATEGORY",
      "CALLSIGN_CONFLICT",
      "NO_CERTIFIED_PILOT",
      "PILOT_NOT_CERTIFIED",
      "PILOT_ROLE_CONFLICT",
      "BRANCH_CREATION_FAILED",
      "INSUFFICIENT_SCOPE",
    ];
    expectTypeOf(codes).toEqualTypeOf<SddErrorCode[]>();
  });
});

describe("SpecPriority", () => {
  it("accepts all 4 priority levels", () => {
    const priorities: SpecPriority[] = ["low", "medium", "high", "critical"];
    expectTypeOf(priorities).toEqualTypeOf<SpecPriority[]>();
  });
});
