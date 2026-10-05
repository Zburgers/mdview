import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useScrollSync } from "../../../src/lib/useScrollSync";

afterEach(() => { document.body.replaceChildren(); });

function panes() {
  const source = document.createElement("textarea");
  source.style.lineHeight = "20px";
  source.style.paddingTop = "0px";
  const preview = document.createElement("div");
  preview.innerHTML = '<span class="source-anchor" data-source-line="20"></span><h2>Matching content</h2>';
  document.body.append(source, preview);
  Object.defineProperties(source, { scrollHeight: { value: 1200 }, clientHeight: { value: 200 } });
  Object.defineProperties(preview, { scrollHeight: { value: 2200 }, clientHeight: { value: 200 } });
  preview.getBoundingClientRect = () => ({ top: 0 } as DOMRect);
  (preview.querySelector("h2") as HTMLElement).getBoundingClientRect = () => ({ top: 1000 - preview.scrollTop } as DOMRect);
  return { source, preview, sourceRef: { current: source }, previewRef: { current: preview } };
}

describe("split pane scroll events", () => {
  it("syncs both directions without programmatic feedback or horizontal-scroll jumps", () => {
    const { source, preview, sourceRef, previewRef } = panes();
    const { result } = renderHook(() => useScrollSync(sourceRef, previewRef, true, "rendered"));
    act(() => { source.scrollTop = 400; result.current.onSourceScroll(); });
    expect(preview.scrollTop).toBe(1000);
    act(() => { result.current.onPreviewScroll(); });
    expect(source.scrollTop).toBe(400);
    act(() => { preview.scrollTop = 1500; result.current.onPreviewScroll(); });
    expect(source.scrollTop).toBe(700);
    act(() => { result.current.onSourceScroll(); source.scrollLeft = 300; result.current.onSourceScroll(); });
    expect(preview.scrollTop).toBe(1500);
  });

  it("leaves the other pane alone when Sync is disabled or rendering is pending", () => {
    const { source, preview, sourceRef, previewRef } = panes();
    const { result, rerender } = renderHook(({ enabled, key }) => useScrollSync(sourceRef, previewRef, enabled, key), {
      initialProps: { enabled: false, key: "rendered" as string | null }
    });
    act(() => { source.scrollTop = 400; result.current.onSourceScroll(); });
    expect(preview.scrollTop).toBe(0);
    rerender({ enabled: true, key: null });
    act(() => { source.scrollTop = 500; result.current.onSourceScroll(); });
    expect(preview.scrollTop).toBe(0);
  });
});
