import { useEffect, useRef } from "react";
import { useSpotlight } from "./spotlight-provider";

export interface SpotlightAutoStartProps {
  tourId: string;
  when: boolean;
}

export function SpotlightAutoStart({ tourId, when }: SpotlightAutoStartProps) {
  const spotlight = useSpotlight();
  const firedRef = useRef(false);

  useEffect(() => {
    if (!when) return;
    if (firedRef.current) return;
    firedRef.current = true;
    spotlight.start(tourId);
  }, [when, tourId, spotlight]);

  return null;
}
