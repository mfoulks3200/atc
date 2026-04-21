import type { CraftCategory, Pilot, SpecDocument, SpecPilotHints, SpecVector } from "@airtrafficcontrol/types";
import {
  CallsignConflictError,
  PilotNotCertifiedError,
  PilotRoleConflictError,
  SpecValidationError,
  UnknownCategoryError,
} from "@airtrafficcontrol/errors";

import { isPilotCertified } from "./certification.js";

/**
 * Validates that a spec document includes all required top-level fields.
 * Delegates vector content validation to {@link validateSpecVectors}.
 *
 * @param spec - The spec document to validate.
 * @throws {SpecValidationError} If any required field is missing or empty.
 * @see RULE-SDD-1
 */
export function validateSpecDocument(spec: SpecDocument): void {
  if (!spec.title || spec.title.trim().length === 0) {
    throw new SpecValidationError("Spec must include a non-empty title.", "title");
  }
  if (!spec.cargo || spec.cargo.trim().length === 0) {
    throw new SpecValidationError("Spec must include a non-empty cargo.", "cargo");
  }
  if (!spec.category || (spec.category as string).trim().length === 0) {
    throw new SpecValidationError("Spec must include a non-empty category.", "category");
  }
  validateSpecVectors(spec.vectors);
}

/**
 * Validates that the vectors array is non-empty and each vector has a name
 * and at least one non-empty acceptance criterion.
 *
 * @param vectors - The vectors array from a spec document.
 * @throws {SpecValidationError} If vectors is empty (RULE-SDD-1) or any vector
 *   has no name or no non-empty criteria (RULE-SDD-2).
 * @see RULE-SDD-1, RULE-SDD-2
 */
export function validateSpecVectors(vectors: SpecVector[]): void {
  if (!vectors || vectors.length === 0) {
    throw new SpecValidationError(
      "Spec must include at least one vector.",
      "vectors",
      "RULE-SDD-1",
    );
  }
  for (const vector of vectors) {
    if (!vector.name || vector.name.trim().length === 0) {
      throw new SpecValidationError(
        "Each vector must include a non-empty name.",
        "vectors[].name",
        "RULE-SDD-2",
      );
    }
    const hasNonEmptyCriterion = vector.criteria?.some((c) => c.trim().length > 0);
    if (!hasNonEmptyCriterion) {
      throw new SpecValidationError(
        `Vector "${vector.name}" must include at least one non-empty criterion.`,
        "vectors[].criteria",
        "RULE-SDD-2",
      );
    }
  }
}

/**
 * Validates that the spec's category is one of the project-configured categories.
 *
 * @param category - The category from the spec document.
 * @param projectCategories - The list of project-configured craft categories.
 * @throws {UnknownCategoryError} If the category is not in the project's configured list.
 * @see RULE-SDD-3
 */
export function validateSpecCategory(
  category: CraftCategory,
  projectCategories: readonly CraftCategory[],
): void {
  if (!projectCategories.includes(category)) {
    throw new UnknownCategoryError(
      `Category "${category}" does not match any project-configured craft category.`,
    );
  }
}

/**
 * Validates that a callsign override is unique among all crafts in the project.
 *
 * @param callsign - The requested callsign override.
 * @param existingCallsigns - All callsigns currently in use within the project.
 * @throws {CallsignConflictError} If the callsign is already in use.
 * @see RULE-SDD-5
 */
export function validateSpecCallsign(
  callsign: string,
  existingCallsigns: readonly string[],
): void {
  if (existingCallsigns.includes(callsign)) {
    throw new CallsignConflictError(
      `Callsign "${callsign}" is already in use by another craft in this project.`,
    );
  }
}

/**
 * Validates explicit pilot hints in a spec document. Checks in order:
 * - The same pilot cannot be both captain and first officer (RULE-SDD-10).
 * - An explicit captain must be certified for the spec's category (RULE-SDD-6).
 * - Each explicit first officer must be certified for the spec's category (RULE-SDD-7).
 *
 * Pilots not found in the provided pool are treated as uncertified.
 *
 * @param hints - The pilot hints from the spec document.
 * @param pilots - All available pilots in the project.
 * @param category - The craft category from the spec.
 * @throws {PilotRoleConflictError} If the same pilot ID appears as both captain and first officer.
 * @throws {PilotNotCertifiedError} If an explicit captain or FO lacks certification.
 * @see RULE-SDD-6, RULE-SDD-7, RULE-SDD-10
 */
export function validateSpecPilots(
  hints: SpecPilotHints,
  pilots: readonly Pilot[],
  category: CraftCategory,
): void {
  const pilotById = new Map<string, Pilot>(pilots.map((p) => [p.identifier, p]));

  if (hints.captain !== undefined && hints.firstOfficers?.includes(hints.captain)) {
    throw new PilotRoleConflictError(
      `Pilot "${hints.captain}" cannot be assigned as both captain and first officer.`,
    );
  }

  if (hints.captain !== undefined) {
    const captain = pilotById.get(hints.captain);
    if (!captain || !isPilotCertified(captain, category)) {
      throw new PilotNotCertifiedError(
        `Pilot "${hints.captain}" is not certified for category "${category}" and cannot serve as captain.`,
        "RULE-SDD-6",
      );
    }
  }

  for (const foId of hints.firstOfficers ?? []) {
    const fo = pilotById.get(foId);
    if (!fo || !isPilotCertified(fo, category)) {
      throw new PilotNotCertifiedError(
        `Pilot "${foId}" is not certified for category "${category}" and cannot serve as first officer.`,
        "RULE-SDD-7",
      );
    }
  }
}
