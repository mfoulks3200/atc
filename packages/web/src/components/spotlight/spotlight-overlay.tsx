import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { SpotlightPopover } from "./spotlight-popover";
import { useSpotlight } from "./spotlight-provider";
import { useTargetRect } from "./use-target-rect";
import { pickPlacement, type Placement } from "./use-popover-placement";

const DEFAULT_POPOVER_SIZE = { width: 260, height: 180 };

export function SpotlightOverlay() {
  const spotlight = useSpotlight();
  const popoverRef = useRef<HTMLDivElement>(null);

  const tour = spotlight.activeTourId ? spotlight.getTour(spotlight.activeTourId) : undefined;
  const step = tour?.steps[spotlight.activeStepIndex];
  const rect = useTargetRect(step?.targetId ?? null);

  const [popoverSize, setPopoverSize] = useState(DEFAULT_POPOVER_SIZE);
  const [viewport, setViewport] = useState(() =>
    typeof window === "undefined"
      ? { width: 1024, height: 768 }
      : { width: window.innerWidth, height: window.innerHeight },
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onResize = () => setViewport({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useLayoutEffect(() => {
    if (popoverRef.current) {
      const { width, height } = popoverRef.current.getBoundingClientRect();
      if (width && height) setPopoverSize({ width, height });
    }
  }, [step?.id, rect]);

  useEffect(() => {
    if (!tour) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") spotlight.stop();
      else if (e.key === "ArrowRight") spotlight.next();
      else if (e.key === "ArrowLeft") spotlight.back();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tour, spotlight]);

  if (!tour || !step) return null;

  if (step.targetId !== null && !rect) return null;

  const placement: Placement = pickPlacement(rect, popoverSize, viewport, step.preferredSide);

  const stepCount = tour.steps.length;
  const stepIndex = spotlight.activeStepIndex;

  return createPortal(
    <div className="pointer-events-none fixed inset-0 z-[1000]">
      {rect ? (
        <>
          <div
            data-testid="spotlight-shade-top"
            className="pointer-events-auto absolute"
            style={{
              top: 0,
              left: 0,
              right: 0,
              height: rect.top,
              backgroundColor: "rgba(0, 0, 0, 0.6)",
            }}
          />
          <div
            data-testid="spotlight-shade-bottom"
            className="pointer-events-auto absolute"
            style={{
              top: rect.bottom,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: "rgba(0, 0, 0, 0.6)",
            }}
          />
          <div
            data-testid="spotlight-shade-left"
            className="pointer-events-auto absolute"
            style={{
              top: rect.top,
              left: 0,
              width: rect.left,
              height: rect.height,
              backgroundColor: "rgba(0, 0, 0, 0.6)",
            }}
          />
          <div
            data-testid="spotlight-shade-right"
            className="pointer-events-auto absolute"
            style={{
              top: rect.top,
              left: rect.right,
              right: 0,
              height: rect.height,
              backgroundColor: "rgba(0, 0, 0, 0.6)",
            }}
          />
        </>
      ) : (
        <div
          data-testid="spotlight-shade-top"
          className="pointer-events-auto absolute inset-0"
          style={{ backgroundColor: "rgba(0, 0, 0, 0.6)" }}
        />
      )}
      <div className="absolute" style={{ top: placement.top, left: placement.left }}>
        <SpotlightPopover
          ref={popoverRef}
          title={step.title}
          body={step.body}
          stepIndex={stepIndex}
          stepCount={stepCount}
          onNext={spotlight.next}
          onBack={spotlight.back}
          onClose={spotlight.stop}
        />
      </div>
    </div>,
    document.body,
  );
}
