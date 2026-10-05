/// <reference types="node" />

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderMarkdownDocument } from "../../../src/rendering/render";
import { enhanceMermaid } from "../../../src/rendering/enhancers/mermaid";

const { initialize, render, createRootMock } = vi.hoisted(() => ({
  initialize: vi.fn(),
  render: vi.fn(),
  createRootMock: vi.fn((host: HTMLElement) => ({
    render(element: { props: { sanitizedSvg: string; error?: string } }) {
      host.innerHTML = element.props.error
        ? `<div class="mermaid-error" role="alert">${element.props.error}</div>`
        : `<div class="diagram-viewer-content">${element.props.sanitizedSvg}</div>`;
    },
    unmount() { host.replaceChildren(); }
  }))
}));
vi.mock("mermaid", () => ({ default: { initialize, render } }));
vi.mock("react-dom/client", () => ({ createRoot: createRootMock }));
vi.mock("../../../src/lib/markdown", () => ({
  containsRemoteResourceReference: (value: string) => /https?:\/\//i.test(value),
  sanitizeMermaidSvg: (svg: string) => svg.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
}));

const gallery = readFileSync(resolve(__dirname, "../../fixtures/rendering/mermaid-gallery.md"), "utf8");

afterEach(() => {
  document.body.innerHTML = "";
  initialize.mockReset();
  render.mockReset();
  createRootMock.mockClear();
});

describe("generic Mermaid enhancement", () => {
  it("hands every fenced Mermaid grammar to the pinned engine and sanitizes SVG", async () => {
    const result = await renderMarkdownDocument(gallery);
    const root = document.createElement("div");
    root.innerHTML = result.html;
    document.body.append(root);
    const sources = Array.from(root.querySelectorAll("pre > code.language-mermaid"), (code) => code.textContent ?? "");
    render.mockImplementation(async (_id: string, source: string) => ({ svg: `<svg><text>${source.split("\n")[0]}</text><script>bad()</script></svg>` }));

    const cleanup = enhanceMermaid(root, "light");
    await waitFor(() => expect(render).toHaveBeenCalledTimes(9));

    expect(sources.map((source) => source.split("\n")[0])).toEqual([
      "flowchart LR", "sequenceDiagram", "classDiagram", "stateDiagram-v2", "erDiagram",
      "pie title Languages", "xychart-beta", "radar-beta", "sankey-beta"
    ]);
    expect(render.mock.calls.map(([, source]) => source)).toEqual(sources);
    expect(initialize).toHaveBeenCalledWith(expect.objectContaining({ securityLevel: "strict", startOnLoad: false, theme: "default" }));
    expect(root.querySelectorAll(".diagram-viewer-content svg")).toHaveLength(9);
    expect(root.innerHTML).not.toContain("<script>");
    cleanup();
  });

  it("blocks remote resource attempts and isolates malformed diagrams", async () => {
    const root = document.createElement("div");
    root.innerHTML = '<p>before</p><pre><code class="language-mermaid">flowchart LR\nA[https://example.test/pixel] --> B</code></pre><pre><code class="language-mermaid">malformed</code></pre><p>after</p>';
    document.body.append(root);
    render.mockRejectedValue(new Error("bad grammar"));

    const cleanup = enhanceMermaid(root, "dark", false);
    await waitFor(() => expect(root.querySelectorAll(".mermaid-error")).toHaveLength(2));

    expect(render).toHaveBeenCalledTimes(1);
    expect(root.textContent).toContain("Remote resources in this Mermaid diagram were blocked.");
    expect(root.textContent).toContain("bad grammar");
    expect(root.querySelector("p")?.textContent).toBe("before");
    expect(root.querySelectorAll("p")[1]?.textContent).toBe("after");
    cleanup();
  });
});
