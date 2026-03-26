import { SeatType } from "./enums.js";

/**
 * Actions a pilot can perform on a craft.
 */
export type PilotAction =
  | "modifyCode"
  | "holdControls"
  | "writeBlackBox"
  | "fileVectorReport"
  | "declareEmergency"
  | "requestLandingClearance";

/**
 * Permission flags for a given seat type.
 */
export type SeatPermissions = Readonly<Record<PilotAction, boolean>>;

/**
 * Permissions matrix mapping each seat type to its allowed actions.
 *
 * @see RULE-SEAT-1 through RULE-SEAT-4
 * @see RULE-CTRL-2 (jumpseaters cannot hold controls)
 * @see RULE-CTRL-3 (must hold controls to modify code)
 * @see RULE-BBOX-3 (all pilots may write to black box)
 * @see RULE-EMER-1 (only captain may declare emergency)
 */
export const PERMISSIONS: Readonly<Record<SeatType, SeatPermissions>> = {
  [SeatType.Captain]: {
    modifyCode: true,
    holdControls: true,
    writeBlackBox: true,
    fileVectorReport: true,
    declareEmergency: true,
    requestLandingClearance: true,
  },
  [SeatType.FirstOfficer]: {
    modifyCode: true,
    holdControls: true,
    writeBlackBox: true,
    fileVectorReport: true,
    declareEmergency: false,
    requestLandingClearance: true,
  },
  [SeatType.Jumpseat]: {
    modifyCode: false,
    holdControls: false,
    writeBlackBox: true,
    fileVectorReport: false,
    declareEmergency: false,
    requestLandingClearance: false,
  },
};
