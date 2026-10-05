import { useEffect, useRef, type RefObject } from "react";
import { mapScroll, scrollPoints, type ScrollPoint } from "./scrollSync";

export function useScrollSync(
  sourceRef: RefObject<HTMLTextAreaElement | null>,
  previewRef: RefObject<HTMLDivElement | null>,
  enabled: boolean,
  renderKey: string | null
) {
  const cache = useRef<{ dimensions: string; points: ScrollPoint[] } | null>(null);
  const lastTop = useRef({ source: 0, preview: 0 });
  const lastOrigin = useRef<"source" | "preview">("source");

  useEffect(() => {
    cache.current = null;
    lastTop.current = { source: sourceRef.current?.scrollTop ?? 0, preview: previewRef.current?.scrollTop ?? 0 };
    if (!enabled || !sourceRef.current || !previewRef.current) return;
    lastOrigin.current = "source";
    let frame = requestAnimationFrame(() => sync("source", true));
    if (typeof ResizeObserver === "undefined") return () => cancelAnimationFrame(frame);
    const observer = new ResizeObserver(() => {
      cache.current = null;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => sync(lastOrigin.current, true));
    });
    observer.observe(sourceRef.current);
    observer.observe(previewRef.current);
    const article = previewRef.current.querySelector("article");
    if (article) observer.observe(article);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [enabled, previewRef, renderKey, sourceRef]);

  function sync(origin: "source" | "preview", force = false) {
    const source = sourceRef.current;
    const preview = previewRef.current;
    if (!enabled || renderKey === null || !source || !preview) return;
    const from = origin === "source" ? source : preview;
    const target = origin === "source" ? preview : source;
    // Horizontal scrolling and events from our own scrollTop assignment must
    // not move the other pane or start a feedback loop.
    if (!force && Math.abs(from.scrollTop - lastTop.current[origin]) < 0.5) return;
    lastOrigin.current = origin;
    lastTop.current[origin] = from.scrollTop;
    const sourceMax = source.scrollHeight - source.clientHeight;
    const previewMax = preview.scrollHeight - preview.clientHeight;
    if (sourceMax <= 0 || previewMax <= 0) return;
    const dimensions = [sourceMax, previewMax, source.clientWidth, preview.clientWidth].join(":");
    if (!cache.current || cache.current.dimensions !== dimensions) {
      const style = getComputedStyle(source);
      const lineHeight = Number.parseFloat(style.lineHeight);
      const padding = Number.parseFloat(style.paddingTop) || 0;
      if (!Number.isFinite(lineHeight) || lineHeight <= 0) return;
      const previewTop = preview.getBoundingClientRect().top + preview.clientTop;
      const anchors = Array.from(preview.querySelectorAll<HTMLElement>(".source-anchor[data-source-line], .source-block[data-source-line]"))
        .filter((marker) => !marker.nextElementSibling?.matches(".source-anchor[data-source-line]"))
        .map((marker) => ({
          source: padding + Number(marker.dataset.sourceLine) * lineHeight,
          preview: (marker.classList.contains("source-block") ? marker : marker.nextElementSibling ?? marker)
            .getBoundingClientRect().top - previewTop + preview.scrollTop
        }));
      cache.current = { dimensions, points: scrollPoints(anchors, sourceMax, previewMax) };
    }
    target.scrollTop = mapScroll(from.scrollTop, cache.current.points, origin);
    lastTop.current[origin === "source" ? "preview" : "source"] = target.scrollTop;
  }

  return { onSourceScroll: () => sync("source"), onPreviewScroll: () => sync("preview") };
}
