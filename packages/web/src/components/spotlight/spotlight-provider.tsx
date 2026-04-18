import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { SpotlightTour } from "./types";
import { clearTourRecord, loadTours, saveTourRecord } from "./persistence";
import { SpotlightOverlay } from "./spotlight-overlay";

export interface SpotlightController {
  activeTourId: string | null;
  activeStepIndex: number;
  start: (tourId: string) => void;
  restart: (tourId: string) => void;
  stop: () => void;
  complete: () => void;
  next: () => void;
  back: () => void;
  isComplete: (tourId: string) => boolean;
  getTour: (tourId: string) => SpotlightTour | undefined;
}

const Ctx = createContext<SpotlightController | null>(null);

export interface SpotlightProviderProps {
  tours: Record<string, SpotlightTour>;
  children: ReactNode;
}

export function SpotlightProvider({ tours, children }: SpotlightProviderProps) {
  const [activeTourId, setActiveTourId] = useState<string | null>(null);
  const [activeStepIndex, setActiveStepIndex] = useState(0);

  const isComplete = useCallback((tourId: string) => {
    return Boolean(loadTours()[tourId]);
  }, []);

  const endTour = useCallback(() => {
    setActiveTourId(null);
    setActiveStepIndex(0);
  }, []);

  const start = useCallback(
    (tourId: string) => {
      const tour = tours[tourId];
      if (!tour) {
        console.warn(`[spotlight] unknown tour id: ${tourId}`);
        return;
      }
      if (loadTours()[tourId]) return;
      if (activeTourId && activeTourId !== tourId) {
        console.warn(
          `[spotlight] tour "${activeTourId}" already active; ignoring start("${tourId}")`,
        );
        return;
      }
      setActiveTourId(tourId);
      setActiveStepIndex(0);
    },
    [tours, activeTourId],
  );

  const restart = useCallback(
    (tourId: string) => {
      const tour = tours[tourId];
      if (!tour) {
        console.warn(`[spotlight] unknown tour id: ${tourId}`);
        return;
      }
      clearTourRecord(tourId);
      setActiveTourId(tourId);
      setActiveStepIndex(0);
    },
    [tours],
  );

  const stop = useCallback(() => {
    if (!activeTourId) return;
    saveTourRecord(activeTourId, "dismissed");
    endTour();
  }, [activeTourId, endTour]);

  const complete = useCallback(() => {
    if (!activeTourId) return;
    saveTourRecord(activeTourId, "completed");
    endTour();
  }, [activeTourId, endTour]);

  const next = useCallback(() => {
    if (!activeTourId) return;
    const tour = tours[activeTourId];
    if (!tour) return;
    setActiveStepIndex((idx) => {
      if (idx >= tour.steps.length - 1) {
        saveTourRecord(activeTourId, "completed");
        setActiveTourId(null);
        return 0;
      }
      return idx + 1;
    });
  }, [activeTourId, tours]);

  const back = useCallback(() => {
    setActiveStepIndex((idx) => Math.max(0, idx - 1));
  }, []);

  const getTour = useCallback((tourId: string) => tours[tourId], [tours]);

  const value = useMemo<SpotlightController>(
    () => ({
      activeTourId,
      activeStepIndex,
      start,
      restart,
      stop,
      complete,
      next,
      back,
      isComplete,
      getTour,
    }),
    [activeTourId, activeStepIndex, start, restart, stop, complete, next, back, isComplete, getTour],
  );

  return (
    <Ctx.Provider value={value}>
      {children}
      <SpotlightOverlay />
    </Ctx.Provider>
  );
}

export function useSpotlight(): SpotlightController {
  const ctx = useContext(Ctx);
  if (!ctx) {
    throw new Error("useSpotlight must be used inside <SpotlightProvider>");
  }
  return ctx;
}
