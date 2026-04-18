export const GUTTER = 12;

export type PlacementSide = "top" | "right" | "bottom" | "left" | "center";

export interface Placement {
  side: PlacementSide;
  top: number;
  left: number;
}

export interface PopoverSize {
  width: number;
  height: number;
}

export interface ViewportSize {
  width: number;
  height: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function tryPlacement(
  target: DOMRect,
  side: Exclude<PlacementSide, "center">,
  popover: PopoverSize,
  viewport: ViewportSize,
): Placement | null {
  let top = 0;
  let left = 0;

  switch (side) {
    case "top":
      top = target.top - popover.height - GUTTER;
      left = target.left + target.width / 2 - popover.width / 2;
      break;
    case "bottom":
      top = target.bottom + GUTTER;
      left = target.left + target.width / 2 - popover.width / 2;
      break;
    case "left":
      top = target.top + target.height / 2 - popover.height / 2;
      left = target.left - popover.width - GUTTER;
      break;
    case "right":
      top = target.top + target.height / 2 - popover.height / 2;
      left = target.right + GUTTER;
      break;
  }

  if (side === "top" || side === "bottom") {
    if (top < GUTTER || top + popover.height > viewport.height - GUTTER) return null;
  }
  if (side === "left" || side === "right") {
    if (left < GUTTER || left + popover.width > viewport.width - GUTTER) return null;
  }

  const clampedLeft = clamp(left, GUTTER, viewport.width - popover.width - GUTTER);
  const clampedTop = clamp(top, GUTTER, viewport.height - popover.height - GUTTER);

  return { side, top: clampedTop, left: clampedLeft };
}

export function pickPlacement(
  target: DOMRect | null,
  popover: PopoverSize,
  viewport: ViewportSize,
  preferredSide?: Exclude<PlacementSide, "center">,
): Placement {
  if (!target) {
    return {
      side: "center",
      top: viewport.height / 2 - popover.height / 2,
      left: viewport.width / 2 - popover.width / 2,
    };
  }

  const order: Exclude<PlacementSide, "center">[] = preferredSide
    ? [
        preferredSide,
        ...(["bottom", "top", "right", "left"] as const).filter((s) => s !== preferredSide),
      ]
    : ["bottom", "top", "right", "left"];

  for (const side of order) {
    const result = tryPlacement(target, side, popover, viewport);
    if (result) return result;
  }

  return {
    side: "center",
    top: viewport.height / 2 - popover.height / 2,
    left: viewport.width / 2 - popover.width / 2,
  };
}
