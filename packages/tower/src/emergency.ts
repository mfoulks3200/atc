import type { Craft } from "@atc/types";
import type { EmergencyReport } from "./types.js";

/**
 * Creates an emergency report for a craft being returned to the origin airport.
 * Extracts the callsign, cargo, flight plan, and complete black box --
 * everything the origin needs to diagnose root cause and decide next steps.
 *
 * @param craft - The craft declaring an emergency.
 * @returns An immutable report for the origin airport.
 * @see RULE-ORIG-2, RULE-EMER-4, RULE-BBOX-4
 */
export function createEmergencyReport(craft: Craft): EmergencyReport {
  return {
    callsign: craft.callsign,
    cargo: craft.cargo,
    flightPlan: craft.flightPlan,
    blackBox: craft.blackBox,
  };
}
