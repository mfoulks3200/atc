import type { FlightPlan, Vector, VectorReport } from "@airtrafficcontrol/types";
import { VectorStatus, VectorType } from "@airtrafficcontrol/types";
import { VectorError } from "@airtrafficcontrol/errors";

/**
 * Options for adversarial review constraint enforcement in {@link reportVector}.
 * @see RULE-VEC-7, RULE-VEC-8
 */
export interface ReportVectorOptions {
  /** Pilot filing this report. Used for adversarial review validation. */
  readonly pilotId?: string;
  /** The most recent preceding vector report on this craft. */
  readonly precedingReport?: VectorReport;
}

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
 * When `options.pilotId` is provided, enforces adversarial review constraints:
 * - RULE-VEC-8: blocks filing on an adversarial_review vector when the pilot
 *   authored the preceding report.
 * - RULE-VEC-7: blocks filing on a standard vector immediately before an
 *   adversarial_review vector when the pilot is that vector's designated reviewer.
 *
 * @param flightPlan - The current flight plan.
 * @param vectorName - The name of the vector being reported.
 * @param options - Optional adversarial review enforcement context.
 * @returns An object containing the updated flight plan and the vector report.
 * @throws {VectorError} If the vector doesn't exist, isn't next in sequence, is already passed, or violates RULE-VEC-7/8.
 * @see RULE-VEC-2, RULE-VEC-3, RULE-VEC-7, RULE-VEC-8, RULE-VRPT-1
 */
export function reportVector(
  flightPlan: FlightPlan,
  vectorName: string,
  options?: ReportVectorOptions,
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

  if (options?.pilotId) {
    const vectorType = vector.type ?? VectorType.Standard;

    if (
      vectorType === VectorType.AdversarialReview &&
      options.precedingReport?.author &&
      options.pilotId === options.precedingReport.author
    ) {
      throw new VectorError(
        `Pilot "${options.pilotId}" filed the preceding report and cannot file the adversarial review [RULE-VEC-8]`,
        "RULE-VEC-8",
      );
    }

    if (vectorType === VectorType.Standard) {
      const nextVector = flightPlan[vectorIndex + 1];
      if (
        nextVector &&
        (nextVector.type ?? VectorType.Standard) === VectorType.AdversarialReview &&
        nextVector.reviewerPilotId &&
        options.pilotId === nextVector.reviewerPilotId
      ) {
        throw new VectorError(
          `Pilot "${options.pilotId}" is the designated reviewer for the next adversarial_review vector and cannot file this report [RULE-VEC-7]`,
          "RULE-VEC-7",
        );
      }
    }
  }

  const updatedPlan: FlightPlan = flightPlan.map((v, i) =>
    i === vectorIndex ? { ...v, status: VectorStatus.Passed } : { ...v },
  );

  const report: VectorReport = {
    craftCallsign: "",
    vectorName,
    acceptanceEvidence: "",
    timestamp: new Date(),
    author: options?.pilotId,
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
