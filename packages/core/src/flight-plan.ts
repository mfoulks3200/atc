import type { FlightPlan, Vector, VectorReport } from "@atc/types";
import { VectorStatus } from "@atc/types";
import { VectorError } from "@atc/errors";

/**
 * Returns the next pending vector in a flight plan.
 *
 * Vectors must be passed in order. This function returns the first vector
 * whose status is Pending, which is the only vector that may be reported next.
 *
 * @param flightPlan - The ordered sequence of vectors.
 * @returns The first Pending vector, or undefined if all are completed.
 * @see RULE-VEC-2
 */
export function getNextVector(flightPlan: FlightPlan): Vector | undefined {
  return flightPlan.find((v) => v.status === VectorStatus.Pending);
}

/**
 * Reports a vector as passed, returning an updated flight plan and a vector report.
 *
 * Validates that the vector exists and is the next in sequence (no skipping).
 * Returns a new flight plan with the vector's status updated to Passed.
 *
 * @param flightPlan - The current flight plan.
 * @param vectorName - The name of the vector being reported.
 * @returns An object containing the updated flight plan and the vector report.
 * @throws {VectorError} If the vector doesn't exist, isn't next in sequence, or is already passed.
 * @see RULE-VEC-2, RULE-VEC-3, RULE-VRPT-1
 */
export function reportVector(
  flightPlan: FlightPlan,
  vectorName: string,
): { flightPlan: FlightPlan; report: VectorReport } {
  const vectorIndex = flightPlan.findIndex((v) => v.name === vectorName);

  if (vectorIndex === -1) {
    throw new VectorError(`Vector "${vectorName}" not found in flight plan`, "RULE-VEC-2");
  }

  const vector = flightPlan[vectorIndex];

  if (vector.status === VectorStatus.Passed) {
    throw new VectorError(`Vector "${vectorName}" has already been passed`, "RULE-VEC-2");
  }

  // Ensure this is the next vector in sequence (no skipping)
  const nextPending = flightPlan.find((v) => v.status === VectorStatus.Pending);
  if (!nextPending || nextPending.name !== vectorName) {
    throw new VectorError(
      `Vector "${vectorName}" is not the next in sequence [RULE-VEC-2]`,
      "RULE-VEC-2",
    );
  }

  const updatedPlan: FlightPlan = flightPlan.map((v, i) =>
    i === vectorIndex ? { ...v, status: VectorStatus.Passed } : { ...v },
  );

  const report: VectorReport = {
    craftCallsign: "",
    vectorName,
    acceptanceEvidence: "",
    timestamp: new Date(),
  };

  return { flightPlan: updatedPlan, report };
}

/**
 * Checks whether every vector in a flight plan has been passed.
 *
 * Returns true for an empty flight plan (vacuously true).
 *
 * @param flightPlan - The flight plan to check.
 * @returns Whether all vectors have status Passed.
 * @see RULE-VEC-4
 */
export function allVectorsPassed(flightPlan: FlightPlan): boolean {
  return flightPlan.every((v) => v.status === VectorStatus.Passed);
}

/**
 * Creates a vector report with the current timestamp.
 *
 * A vector report documents that a craft has passed through a specific vector,
 * including evidence that acceptance criteria were met.
 *
 * @param craftCallsign - The craft that passed the vector.
 * @param vectorName - The vector that was passed.
 * @param evidence - Proof that acceptance criteria were met.
 * @returns A new VectorReport with the current timestamp.
 * @see RULE-VRPT-2
 */
export function createVectorReport(
  craftCallsign: string,
  vectorName: string,
  evidence: string,
): VectorReport {
  return {
    craftCallsign,
    vectorName,
    acceptanceEvidence: evidence,
    timestamp: new Date(),
  };
}
