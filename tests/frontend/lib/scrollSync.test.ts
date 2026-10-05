import { describe, expect, it } from "vitest";
import { mapScroll, scrollPoints } from "../../../src/lib/scrollSync";

describe("content-based split scrolling", () => {
  const points = scrollPoints([{ source: 400, preview: 1000 }], 1000, 2000);

  it("aligns matching source blocks instead of percentages", () => {
    expect(mapScroll(400, points, "source")).toBe(1000);
    expect(mapScroll(200, points, "source")).toBe(500);
  });

  it("maps preview scrolling back to the same source content", () => {
    expect(mapScroll(1000, points, "preview")).toBe(400);
    expect(mapScroll(1500, points, "preview")).toBe(700);
  });

  it("reaches both ends and drops duplicate or out-of-range anchors", () => {
    const points = scrollPoints([
      { source: 400, preview: 1000 }, { source: 400, preview: 1200 },
      { source: 500, preview: 900 }, { source: 1200, preview: 2300 }
    ], 1000, 2000);
    expect(points).toHaveLength(3);
    expect(mapScroll(-100, points, "source")).toBe(0);
    expect(mapScroll(2000, points, "source")).toBe(2000);
    expect(mapScroll(2000, points, "preview")).toBe(1000);
    expect(Number.isFinite(mapScroll(0, scrollPoints([], 0, 0), "source"))).toBe(true);
  });
});
