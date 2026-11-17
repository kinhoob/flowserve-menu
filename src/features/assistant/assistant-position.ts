export type Point = { x: number; y: number };
export type Viewport = { width: number; height: number };
export const MASCOT_SIZE = 64;
export function clampMascot(point: Point, view: Viewport): Point {
  return {
    x: Math.max(8, Math.min(point.x, Math.max(8, view.width - MASCOT_SIZE - 8))),
    y: Math.max(8, Math.min(point.y, Math.max(8, view.height - MASCOT_SIZE - 8))),
  };
}
export function bubblePlacement(point: Point, view: Viewport) {
  const width = Math.max(120, Math.min(320, view.width - 24));
  const x = Math.max(12, Math.min(point.x + 32 - width / 2, view.width - width - 12));
  const above = point.y - 20,
    below = view.height - point.y - MASCOT_SIZE - 20;
  const top = above < 220 && below > above;
  return {
    width,
    left: x - point.x,
    top,
    maxHeight: Math.max(64, Math.min(420, top ? below : above)),
    tail: Math.max(20, Math.min(point.x + 32 - x, width - 20)),
  };
}
