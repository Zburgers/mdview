import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { DiagramViewer } from "../../components/DiagramViewer";
import { containsRemoteResourceReference, sanitizeMermaidSvg } from "../../lib/markdown";

let nextDiagramId = 0;

export function enhanceMermaid(
  root: HTMLElement,
  theme: "light" | "dark",
  allowRemoteImages = false
): () => void {
  let cancelled = false;
  const viewerRoots: Root[] = [];

  void renderDiagrams();

  async function renderDiagrams() {
    const diagrams = Array.from(root.querySelectorAll<HTMLElement>(
      "pre > code.language-mermaid, .mermaid-host[data-mermaid-source]"
    ));
    if (diagrams.length === 0) return;
    const { default: mermaid } = await import("mermaid");
    if (cancelled) return;
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      theme: theme === "dark" ? "dark" : "default"
    });

    for (const block of diagrams) {
      if (cancelled || !root.contains(block)) continue;
      const isCode = block.tagName.toLowerCase() === "code";
      const source = isCode ? block.textContent ?? "" : block.dataset.mermaidSource ?? "";
      const host = isCode ? document.createElement("div") : block as HTMLDivElement;
      if (isCode) {
        host.className = "mermaid-host";
        host.dataset.mermaidSource = source;
        block.parentElement?.replaceWith(host);
      }
      const viewer = createRoot(host);
      viewerRoots.push(viewer);

      if (!allowRemoteImages && containsRemoteResourceReference(source)) {
        viewer.render(createElement(DiagramViewer, {
          sanitizedSvg: "",
          source,
          error: "Remote resources in this Mermaid diagram were blocked."
        }));
        continue;
      }

      try {
        const { svg } = await mermaid.render(`mdview-mermaid-${nextDiagramId++}`, source);
        if (cancelled || !root.contains(host)) continue;
        const sanitizedSvg = sanitizeMermaidSvg(svg, { allowRemoteImages });
        viewer.render(createElement(DiagramViewer, sanitizedSvg
          ? { sanitizedSvg, source }
          : { sanitizedSvg: "", source, error: "Mermaid produced invalid SVG." }));
      } catch (cause: unknown) {
        if (!cancelled && root.contains(host)) {
          viewer.render(createElement(DiagramViewer, {
            sanitizedSvg: "",
            source,
            error: cause instanceof Error ? cause.message : "Mermaid diagram failed."
          }));
        }
      }
    }
  }

  return () => {
    cancelled = true;
    viewerRoots.forEach((viewer) => viewer.unmount());
  };
}
