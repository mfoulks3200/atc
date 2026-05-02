export { createBlackBoxEntry, appendToBlackBox } from "./black-box.js";

export {
  createInitialControls,
  claimExclusiveControls,
  shareControls,
  isHoldingControls,
  validateControlsReleasedForAdversarialReview,
} from "./controls.js";

export { createCraft } from "./craft.js";
export type { CreateCraftParams } from "./craft.js";

export {
  getNextVector,
  reportVector,
  allVectorsPassed,
  createVectorReport,
} from "./flight-plan.js";
export type { ReportVectorOptions } from "./flight-plan.js";

export {
  transitionCraft,
  canTransition,
  isTerminalState,
  mapTransitionToEvents,
} from "./lifecycle.js";
export type { TransitionContext } from "./lifecycle.js";

export {
  createTfr,
  liftTfr,
  isAffectedByTfr,
  getActiveTfrs,
  applyHoldingPattern,
  clearHoldingPattern,
} from "./tfr.js";
export type { CreateTfrParams } from "./tfr.js";

export { slugifyTitle } from "./callsign.js";
export type { CallsignResult } from "./callsign.js";

export { computeWorkloadScore, selectFirstOfficers } from "./pilot-selection.js";
export type { SelectionParams } from "./pilot-selection.js";

export { generateCallsign, selectCaptain } from "./sdd.js";
export type { SelectCaptainParams } from "./sdd.js";
