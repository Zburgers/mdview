import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { DiagramViewer } from "../../components/DiagramViewer";
import { containsRemoteResourceReference, sanitizeMermaidSvg } from "../../lib/markdown";

let nextDiagramId = 0;
const MERMAID_LOAD_TIMEOUT_MS = 10_000;

type MermaidModuleLoader = () => Promise<typeof import("mermaid")>;

export function enhanceMermaid(
  root: HTMLElement,
  theme: "light" | "dark",
  allowRemoteImages = false,
  loadMermaid: MermaidModuleLoader = () => import("mermaid")
): () => void {
  let cancelled = false;
  const viewerRoots: Root[] = [];

  void renderDiagrams();

  async function renderDiagrams() {
    if (root.querySelector("pre > code.language-mermaid, .mermaid-host[data-mermaid-source]") === null) return;
    let loadTimeout: ReturnType<typeof setTimeout> | undefined;
    let mermaid: (typeof import("mermaid"))["default"];
    try {
      const module = await Promise.race([
        loadMermaid(),
        new Promise<never>((_, reject) => {
          loadTimeout = setTimeout(() => reject(new Error("Mermaid renderer load timed out.")), MERMAID_LOAD_TIMEOUT_MS);
        })
      ]);
      mermaid = module.default;
    } catch {
      if (cancelled) return;
      replaceDiagramsWithLoadError(root, viewerRoots);
      return;
    } finally {
      if (loadTimeout !== undefined) clearTimeout(loadTimeout);
    }
    if (cancelled) return;
    const secure = mermaid.mermaidAPI.getConfig().secure ?? [];
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      htmlLabels: false,
      secure: Array.from(new Set([...secure, "htmlLabels"])),
      theme: theme === "dark" ? "dark" : "default"
    });

    // Read the live subtree after the asynchronous module load. React may have
    // replaced the previous HTML while the chunk was resolving.
    const diagrams = Array.from(root.querySelectorAll<HTMLElement>(
      "pre > code.language-mermaid, .mermaid-host[data-mermaid-source]"
    ));
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

function replaceDiagramsWithLoadError(root: HTMLElement, viewerRoots: Root[]): void {
  const codes = Array.from(root.querySelectorAll<HTMLElement>("pre > code.language-mermaid"));
  for (const code of codes) {
    const source = code.textContent ?? "";
    const host = document.createElement("div");
    host.className = "mermaid-host";
    host.dataset.mermaidSource = source;
    code.parentElement?.replaceWith(host);
    const viewer = createRoot(host);
    viewerRoots.push(viewer);
    viewer.render(createElement(DiagramViewer, {
      sanitizedSvg: "",
      source,
      error: "Mermaid renderer could not be loaded."
    }));
  }
}
