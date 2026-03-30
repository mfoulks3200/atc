export { createBlackBoxEntry, appendToBlackBox } from "./black-box.js";

export {
  createInitialControls,
  claimExclusiveControls,
  shareControls,
  isHoldingControls,
} from "./controls.js";

export { createCraft } from "./craft.js";
export type { CreateCraftParams } from "./craft.js";

export {
  getNextVector,
  reportVector,
  allVectorsPassed,
  createVectorReport,
} from "./flight-plan.js";

export {
  transitionCraft,
  canTransition,
  isTerminalState,
  mapTransitionToEvents,
} from "./lifecycle.js";
