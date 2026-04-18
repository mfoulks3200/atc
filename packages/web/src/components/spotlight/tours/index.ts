import type { SpotlightTour } from "../types";
import { firstRunTour } from "./first-run";

export const tours: Record<string, SpotlightTour> = {
  "first-run": firstRunTour,
};

export { firstRunTour };
