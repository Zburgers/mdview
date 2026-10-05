export type ScrollPoint = { source: number; preview: number };

export function scrollPoints(anchors: readonly ScrollPoint[], sourceMax: number, previewMax: number): ScrollPoint[] {
  const points: ScrollPoint[] = [{ source: 0, preview: 0 }];
  for (const anchor of anchors) {
    const previous = points[points.length - 1];
    if (anchor.source > previous.source && anchor.preview > previous.preview &&
        anchor.source < sourceMax && anchor.preview < previewMax) points.push(anchor);
  }
  points.push({ source: Math.max(0, sourceMax), preview: Math.max(0, previewMax) });
  return points;
}

export function mapScroll(top: number, points: readonly ScrollPoint[], origin: "source" | "preview"): number {
  const target = origin === "source" ? "preview" : "source";
  if (points.length < 2) return 0;
  const last = points[points.length - 1];
  if (top >= last[origin]) return last[target];
  for (let index = 1; index < points.length; index++) {
    const end = points[index];
    if (top > end[origin]) continue;
    const start = points[index - 1];
    const span = end[origin] - start[origin];
    return span > 0 ? start[target] + Math.max(0, (top - start[origin]) / span) * (end[target] - start[target]) : start[target];
  }
  return last[target];
}
