export interface SpotlightStep {
  id: string;
  targetId: string | null;
  title: string;
  body: string;
  preferredSide?: "top" | "right" | "bottom" | "left";
}

export interface SpotlightTour {
  id: string;
  steps: SpotlightStep[];
}

export type TourStatus = "completed" | "dismissed";

export interface TourRecord {
  status: TourStatus;
  at: string;
}

export type PersistedTours = Record<string, TourRecord>;
