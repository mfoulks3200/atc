import { describe, it, expectTypeOf } from "vitest";
import type {
  SpecDocument,
  SpecVector,
  SpecVectorCommand,
  SpecPilotHints,
  SddErrorCode,
  SpecPriority,
} from "./sdd.js";

describe("SpecVectorCommand", () => {
  it("requires run string", () => {
    const cmd: SpecVectorCommand = { run: "pnpm test" };
    expectTypeOf(cmd.run).toBeString();
  });

  it("timeout and severity are optional", () => {
    const cmd: SpecVectorCommand = { run: "exit 0", timeout: 30_000, severity: "required" };
    expectTypeOf(cmd.timeout).toEqualTypeOf<number | undefined>();
    expectTypeOf(cmd.severity).toEqualTypeOf<"required" | "advisory" | undefined>();
  });

  it("accepts advisory severity", () => {
    const cmd: SpecVectorCommand = { run: "exit 0", severity: "advisory" };
    expectTypeOf(cmd.severity).toEqualTypeOf<"required" | "advisory" | undefined>();
  });
});

describe("SpecVector", () => {
  it("accepts criteria-only vector", () => {
    const v: SpecVector = { name: "Setup DB", criteria: ["migration runs without error"] };
    expectTypeOf(v.name).toBeString();
    expectTypeOf(v.criteria).toEqualTypeOf<string[] | undefined>();
  });

  it("accepts command-only vector (no criteria)", () => {
    const v: SpecVector = { name: "Lint", command: { run: "pnpm lint" } };
    expectTypeOf(v.command).toEqualTypeOf<SpecVectorCommand | undefined>();
    expect(v.criteria).toBeUndefined();
  });

  it("accepts both criteria and command", () => {
    const v: SpecVector = {
      name: "Tests",
      criteria: ["all tests pass"],
      command: { run: "pnpm test", severity: "required" },
    };
    expect(v.criteria).toHaveLength(1);
    expect(v.command?.severity).toBe("required");
  });

  it("criteria is optional", () => {
    expectTypeOf({} as SpecVector).toMatchTypeOf<{ criteria?: string[] }>();
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

  it("accepts a command-gate vector in the document", () => {
    const doc: SpecDocument = {
      title: "Add CI",
      cargo: "Add CI pipeline",
      category: "Infrastructure",
      vectors: [{ name: "Pipeline passes", command: { run: "pnpm test", severity: "required" } }],
    };
    expect(doc.vectors[0].command?.run).toBe("pnpm test");
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
});

describe("SddErrorCode", () => {
  it("includes VECTOR_COMMAND_FAILED and INSUFFICIENT_SCOPE", () => {
    const codes: SddErrorCode[] = [
      "SPEC_PARSE_ERROR",
      "SPEC_VALIDATION_ERROR",
      "UNKNOWN_CATEGORY",
      "CALLSIGN_CONFLICT",
      "NO_CERTIFIED_PILOT",
      "PILOT_NOT_CERTIFIED",
      "PILOT_ROLE_CONFLICT",
      "BRANCH_CREATION_FAILED",
      "VECTOR_COMMAND_FAILED",
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
