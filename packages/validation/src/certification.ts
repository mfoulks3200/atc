import type { Pilot } from "@atc/types";

/**
 * Checks whether a pilot holds a certification for the given craft category.
 *
 * A pilot is certified if their `certifications` array contains an exact match
 * for the given category string. Matching is case-sensitive.
 *
 * @param pilot - The pilot to check.
 * @param category - The craft category to check certification for.
 * @returns `true` if the pilot's certifications include the category.
 * @see RULE-PILOT-2
 */
export function isPilotCertified(pilot: Pilot, category: string): boolean {
  return pilot.certifications.includes(category);
}
