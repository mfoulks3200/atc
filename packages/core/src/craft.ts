import type { Craft, Pilot, Vector, FlightPlan } from "@atc/types";
import { CraftStatus, VectorStatus } from "@atc/types";
import { CraftError } from "@atc/errors";
import { validateCraftCrew } from "@atc/validation";
import { createInitialControls } from "./controls.js";

/**
 * Parameters for creating a new craft.
 */
export interface CreateCraftParams {
  /** Unique, immutable identifier. @see RULE-CRAFT-1 */
  readonly callsign: string;
  /** Associated git branch (1:1). @see RULE-CRAFT-2 */
  readonly branch: string;
  /** Description of the change and its scope. @see RULE-CRAFT-3 */
  readonly cargo: string;
  /** Classification of change type. @see RULE-CRAFT-4 */
  readonly category: string;
  /** Pilot-in-command. Must be certified for the category. @see RULE-CRAFT-5, RULE-SEAT-2 */
  readonly captain: Pilot;
  /** Certified assistant pilots. @see RULE-SEAT-2 */
  readonly firstOfficers?: readonly Pilot[];
  /** Observer/advisor pilots. @see RULE-SEAT-3 */
  readonly jumpseaters?: readonly Pilot[];
  /** Ordered milestones for the craft. @see RULE-VEC-1 */
  readonly flightPlan: readonly Vector[];
}

/**
 * Creates a new craft, validating all RULE-CRAFT-* invariants.
 *
 * The craft is initialized in the Taxiing state with an empty black box
 * and exclusive controls held by the captain.
 *
 * @param params - The craft creation parameters.
 * @returns A new Craft in the Taxiing state.
 * @throws {CraftError} If any creation rule is violated.
 * @see RULE-CRAFT-1 through RULE-CRAFT-5, RULE-LIFE-1, RULE-BBOX-1, RULE-CTRL-1
 */
export function createCraft(params: CreateCraftParams): Craft {
  if (!params.callsign) {
    throw new CraftError("Craft callsign is required [RULE-CRAFT-1]", "RULE-CRAFT-1");
  }
  if (!params.branch) {
    throw new CraftError("Craft branch is required [RULE-CRAFT-2]", "RULE-CRAFT-2");
  }
  if (!params.cargo) {
    throw new CraftError("Craft cargo is required [RULE-CRAFT-3]", "RULE-CRAFT-3");
  }
  if (!params.category) {
    throw new CraftError("Craft category is required [RULE-CRAFT-4]", "RULE-CRAFT-4");
  }

  const firstOfficers = params.firstOfficers ?? [];
  const jumpseaters = params.jumpseaters ?? [];

  // Validate crew certifications using @atc/validation
  // This checks RULE-SEAT-2, RULE-SEAT-3, RULE-CRAFT-5
  validateCraftCrew(params.captain, firstOfficers, params.category);

  const flightPlan: FlightPlan = params.flightPlan.map((v) => ({
    ...v,
    status: VectorStatus.Pending,
  }));

  return {
    callsign: params.callsign,
    branch: params.branch,
    cargo: params.cargo,
    category: params.category,
    captain: params.captain,
    firstOfficers: [...firstOfficers],
    jumpseaters: [...jumpseaters],
    flightPlan,
    blackBox: [],
    controls: createInitialControls(params.captain.identifier),
    status: CraftStatus.Taxiing,
  };
}
