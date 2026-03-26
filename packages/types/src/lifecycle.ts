import { CraftStatus } from "./enums.js";

/**
 * A valid state transition in the craft lifecycle.
 * @see RULE-LIFE-2
 */
export interface CraftTransition {
  readonly from: CraftStatus;
  readonly to: CraftStatus;
  readonly trigger: string;
  readonly preconditions: readonly string[];
}

/**
 * Terminal states — no transitions out are permitted.
 * @see RULE-LIFE-8
 */
export const TERMINAL_STATES: ReadonlySet<CraftStatus> = new Set([
  CraftStatus.Landed,
  CraftStatus.ReturnToOrigin,
]);

/**
 * All valid state transitions in the craft lifecycle.
 * Any transition not listed here is illegal.
 * @see RULE-LIFE-2
 */
export const TRANSITIONS: readonly CraftTransition[] = [
  {
    from: CraftStatus.Taxiing,
    to: CraftStatus.InFlight,
    trigger: "Pilot begins implementation.",
    preconditions: ["Captain assigned", "Cargo defined", "Flight plan assigned"],
  },
  {
    from: CraftStatus.InFlight,
    to: CraftStatus.InFlight,
    trigger: "Pilot passes a vector and reports to ATC.",
    preconditions: ["Next vector in flight plan sequence"],
  },
  {
    from: CraftStatus.InFlight,
    to: CraftStatus.LandingChecklist,
    trigger: "Pilot begins validation checks.",
    preconditions: ["All vectors passed and reported"],
  },
  {
    from: CraftStatus.LandingChecklist,
    to: CraftStatus.ClearedToLand,
    trigger: "All checks pass; tower grants clearance.",
    preconditions: ["All checklist items pass"],
  },
  {
    from: CraftStatus.LandingChecklist,
    to: CraftStatus.GoAround,
    trigger: "One or more checks fail.",
    preconditions: ["At least one checklist item failed"],
  },
  {
    from: CraftStatus.GoAround,
    to: CraftStatus.LandingChecklist,
    trigger: "Pilot re-attempts after addressing failures.",
    preconditions: ["Pilot has addressed failure(s)"],
  },
  {
    from: CraftStatus.GoAround,
    to: CraftStatus.Emergency,
    trigger: "Repeated failures exceed threshold or pilot escalates.",
    preconditions: ["Captain decision"],
  },
  {
    from: CraftStatus.ClearedToLand,
    to: CraftStatus.Landed,
    trigger: "Tower merges branch into main.",
    preconditions: ["Branch up to date with main"],
  },
  {
    from: CraftStatus.Emergency,
    to: CraftStatus.ReturnToOrigin,
    trigger: "Craft sent back to design stage with black box.",
    preconditions: ["EmergencyDeclaration recorded in black box"],
  },
];
