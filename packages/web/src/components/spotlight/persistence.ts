import type { PersistedTours, TourStatus } from "./types";

export const STORAGE_KEY = "atc.spotlight.v1";

export function loadTours(): PersistedTours {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") return parsed as PersistedTours;
    return {};
  } catch {
    return {};
  }
}

export function saveTourRecord(tourId: string, status: TourStatus): void {
  try {
    const tours = loadTours();
    tours[tourId] = { status, at: new Date().toISOString() };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tours));
  } catch (err) {
    console.warn("[spotlight] failed to persist tour record", err);
  }
}

export function clearTourRecord(tourId: string): void {
  try {
    const tours = loadTours();
    delete tours[tourId];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tours));
  } catch (err) {
    console.warn("[spotlight] failed to clear tour record", err);
  }
}
