import { describe, it, expect } from "vitest";
import { pickPlacement, GUTTER } from "./use-popover-placement";

const POPOVER = { width: 260, height: 160 };
const VIEWPORT = { width: 1200, height: 800 };

function rect(top: number, left: number, width: number, height: number): DOMRect {
  return {
    top,
    left,
    width,
    height,
    right: left + width,
    bottom: top + height,
    x: left,
    y: top,
    toJSON: () => ({}),
  } as DOMRect;
}

describe("pickPlacement", () => {
  it("returns side='center' when target rect is null", () => {
    const result = pickPlacement(null, POPOVER, VIEWPORT);
    expect(result.side).toBe("center");
  });

  it("uses preferredSide when it fits", () => {
    const target = rect(400, 500, 120, 40);
    const result = pickPlacement(target, POPOVER, VIEWPORT, "top");
    expect(result.side).toBe("top");
  });

  it("falls back to bottom when preferredSide=top does not fit", () => {
    const target = rect(10, 500, 120, 40);
    const result = pickPlacement(target, POPOVER, VIEWPORT, "top");
    expect(result.side).toBe("bottom");
  });

  it("falls back through bottom → top → right → left order", () => {
    const target = rect(400, 0, 100, 40);
    const result = pickPlacement(target, POPOVER, VIEWPORT);
    expect(["bottom", "top", "right"]).toContain(result.side);
  });

  it("centers in viewport when no side fits", () => {
    const tiny = { width: 200, height: 200 };
    const target = rect(80, 40, 60, 40);
    const result = pickPlacement(target, POPOVER, tiny);
    expect(result.side).toBe("center");
  });

  it("clamps horizontal position to keep popover on-screen", () => {
    const target = rect(400, 1180, 40, 20);
    const result = pickPlacement(target, POPOVER, VIEWPORT);
    expect(result.left + POPOVER.width).toBeLessThanOrEqual(VIEWPORT.width - GUTTER + 1);
  });
});
