import { describe, it, expect } from "vitest";
import { VectorStatus, VectorType } from "@airtrafficcontrol/types";
import type { FlightPlan, VectorReport } from "@airtrafficcontrol/types";
import {
  getNextVector,
  reportVector,
  allVectorsPassed,
  createVectorReport,
} from "./flight-plan.js";

function makePlan(...statuses: VectorStatus[]): FlightPlan {
  return statuses.map((status, i) => ({
    name: `Vector-${i + 1}`,
    acceptanceCriteria: `Criteria for vector ${i + 1}`,
    status,
  }));
}

describe("getNextVector", () => {
  it("returns the first Pending vector (RULE-VEC-2)", () => {
    const plan = makePlan(VectorStatus.Passed, VectorStatus.Pending, VectorStatus.Pending);
    const next = getNextVector(plan);

    expect(next).toBeDefined();
    expect(next!.name).toBe("Vector-2");
  });

  it("returns undefined when all vectors are Passed", () => {
    const plan = makePlan(VectorStatus.Passed, VectorStatus.Passed);
    const next = getNextVector(plan);

    expect(next).toBeUndefined();
  });

  it("returns the first vector when none have been passed", () => {
    const plan = makePlan(VectorStatus.Pending, VectorStatus.Pending);
    const next = getNextVector(plan);

    expect(next).toBeDefined();
    expect(next!.name).toBe("Vector-1");
  });

  it("returns undefined for an empty flight plan", () => {
    const next = getNextVector([]);

    expect(next).toBeUndefined();
  });
});

describe("reportVector", () => {
  it("marks the correct vector as Passed and returns updated flight plan", () => {
    const plan = makePlan(VectorStatus.Pending, VectorStatus.Pending);
    const result = reportVector(plan, "Vector-1");

    expect(result.flightPlan[0].status).toBe(VectorStatus.Passed);
    expect(result.flightPlan[1].status).toBe(VectorStatus.Pending);
  });

  it("returns a VectorReport with correct data (RULE-VRPT-2)", () => {
    const plan = makePlan(VectorStatus.Pending);
    const result = reportVector(plan, "Vector-1");

    expect(result.report).toBeDefined();
    expect(result.report.vectorName).toBe("Vector-1");
    expect(result.report.timestamp).toBeInstanceOf(Date);
  });

  it("does not mutate the original flight plan", () => {
    const plan = makePlan(VectorStatus.Pending, VectorStatus.Pending);
    const result = reportVector(plan, "Vector-1");

    expect(plan[0].status).toBe(VectorStatus.Pending);
    expect(result.flightPlan[0].status).toBe(VectorStatus.Passed);
  });

  it("throws VectorError when vector name does not exist", () => {
    const plan = makePlan(VectorStatus.Pending);

    expect(() => reportVector(plan, "NonExistent")).toThrow();
  });

  it("throws VectorError when vector is not the next in sequence (RULE-VEC-2)", () => {
    const plan = makePlan(VectorStatus.Pending, VectorStatus.Pending);

    expect(() => reportVector(plan, "Vector-2")).toThrow("RULE-VEC-2");
  });

  it("throws VectorError when vector has already been Passed", () => {
    const plan = makePlan(VectorStatus.Passed, VectorStatus.Pending);

    expect(() => reportVector(plan, "Vector-1")).toThrow();
  });
});

describe("allVectorsPassed", () => {
  it("returns true when all vectors are Passed (RULE-VEC-4)", () => {
    const plan = makePlan(VectorStatus.Passed, VectorStatus.Passed);

    expect(allVectorsPassed(plan)).toBe(true);
  });

  it("returns false when any vector is Pending", () => {
    const plan = makePlan(VectorStatus.Passed, VectorStatus.Pending);

    expect(allVectorsPassed(plan)).toBe(false);
  });

  it("returns false when any vector is Failed", () => {
    const plan = makePlan(VectorStatus.Passed, VectorStatus.Failed);

    expect(allVectorsPassed(plan)).toBe(false);
  });

  it("returns true for an empty flight plan", () => {
    expect(allVectorsPassed([])).toBe(true);
  });
});

describe("reportVector adversarial review constraints", () => {
  function makeAdversarialPlan(): FlightPlan {
    return [
      {
        name: "Implement",
        acceptanceCriteria: "Code complete",
        status: VectorStatus.Pending,
        type: VectorType.Standard,
      },
      {
        name: "Review",
        acceptanceCriteria: "Code reviewed",
        status: VectorStatus.Pending,
        type: VectorType.AdversarialReview,
        reviewerPilotId: "reviewer-1",
      },
    ];
  }

  it("allows filing when pilotId differs from preceding report author (RULE-VEC-8)", () => {
    const plan = makeAdversarialPlan();
    plan[0].status = VectorStatus.Passed;
    const preceding: VectorReport = {
      craftCallsign: "C1",
      vectorName: "Implement",
      acceptanceEvidence: "",
      timestamp: new Date(),
      author: "builder-1",
    };

    const result = reportVector(plan, "Review", {
      pilotId: "reviewer-1",
      precedingReport: preceding,
    });
    expect(result.flightPlan[1].status).toBe(VectorStatus.Passed);
  });

  it("blocks filing when pilotId matches preceding report author (RULE-VEC-8)", () => {
    const plan = makeAdversarialPlan();
    plan[0].status = VectorStatus.Passed;
    const preceding: VectorReport = {
      craftCallsign: "C1",
      vectorName: "Implement",
      acceptanceEvidence: "",
      timestamp: new Date(),
      author: "builder-1",
    };

    expect(() =>
      reportVector(plan, "Review", {
        pilotId: "builder-1",
        precedingReport: preceding,
      }),
    ).toThrow("RULE-VEC-8");
  });

  it("blocks filing standard vector when pilotId is the next adversarial reviewer (RULE-VEC-7)", () => {
    const plan = makeAdversarialPlan();

    expect(() =>
      reportVector(plan, "Implement", {
        pilotId: "reviewer-1",
      }),
    ).toThrow("RULE-VEC-7");
  });

  it("allows filing standard vector when pilotId is not the next adversarial reviewer", () => {
    const plan = makeAdversarialPlan();

    const result = reportVector(plan, "Implement", {
      pilotId: "builder-1",
    });
    expect(result.flightPlan[0].status).toBe(VectorStatus.Passed);
  });

  it("does not enforce constraints when pilotId is absent", () => {
    const plan = makeAdversarialPlan();

    const result = reportVector(plan, "Implement");
    expect(result.flightPlan[0].status).toBe(VectorStatus.Passed);
  });

  it("includes author in the report when pilotId is provided", () => {
    const plan = makePlan(VectorStatus.Pending);
    const result = reportVector(plan, "Vector-1", { pilotId: "pilot-1" });
    expect(result.report.author).toBe("pilot-1");
  });

  it("omits author in the report when pilotId is absent", () => {
    const plan = makePlan(VectorStatus.Pending);
    const result = reportVector(plan, "Vector-1");
    expect(result.report.author).toBeUndefined();
  });
});

describe("createVectorReport", () => {
  it("creates a report with all required fields (RULE-VRPT-2)", () => {
    const report = createVectorReport("CRAFT-001", "Vector-1", "All tests pass, 95% coverage");

    expect(report.craftCallsign).toBe("CRAFT-001");
    expect(report.vectorName).toBe("Vector-1");
    expect(report.acceptanceEvidence).toBe("All tests pass, 95% coverage");
    expect(report.timestamp).toBeInstanceOf(Date);
  });

  it("sets a timestamp at creation time", () => {
    const before = new Date();
    const report = createVectorReport("CRAFT-001", "V1", "evidence");
    const after = new Date();

    expect(report.timestamp.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(report.timestamp.getTime()).toBeLessThanOrEqual(after.getTime());
  });
});
