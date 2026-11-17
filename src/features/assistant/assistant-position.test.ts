import { describe, it, expect } from "vitest";
import { clampMascot, bubblePlacement } from "./assistant-position";
describe("mascot placement", () => {
  it("keeps a dragged mascot reachable at all four mobile edges", () => {
    const v = { width: 320, height: 568 };
    expect(clampMascot({ x: -100, y: -50 }, v)).toEqual({ x: 8, y: 8 });
    expect(clampMascot({ x: 900, y: 900 }, v)).toEqual({ x: 248, y: 496 });
  });
  it("recovers a saved desktop position on a smaller viewport", () => {
    expect(clampMascot({ x: 1440, y: 1000 }, { width: 390, height: 400 })).toEqual({
      x: 318,
      y: 328,
    });
  });
  it("places speech below a mascot near the top and above one near the bottom", () => {
    const v = { width: 390, height: 844 };
    expect(bubblePlacement({ x: 10, y: 10 }, v).top).toBe(true);
    expect(bubblePlacement({ x: 300, y: 700 }, v).top).toBe(false);
  });
  it("keeps speech within either horizontal edge", () => {
    const v = { width: 320, height: 568 };
    for (const p of [
      { x: 8, y: 20 },
      { x: 248, y: 490 },
    ]) {
      const b = bubblePlacement(p, v);
      expect(p.x + b.left).toBeGreaterThanOrEqual(12);
      expect(p.x + b.left + b.width).toBeLessThanOrEqual(v.width - 12);
      expect(b.tail).toBeGreaterThanOrEqual(20);
      expect(b.maxHeight).toBeLessThanOrEqual(420);
    }
  });
});
