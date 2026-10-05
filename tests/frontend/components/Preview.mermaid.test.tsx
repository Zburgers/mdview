import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Preview } from "../../../src/components/Preview";
import type { MarkdownRenderState } from "../../../src/rendering/useMarkdownRender";

const { initialize, renderMermaid, sanitize, getConfig, secureDefaults } = vi.hoisted(() => {
  const secureDefaults = ["secure", "securityLevel", "startOnLoad", "maxTextSize", "suppressErrorRendering", "maxEdges"];
  return {
    initialize: vi.fn(),
    renderMermaid: vi.fn(),
    getConfig: vi.fn(() => ({ secure: secureDefaults })),
    secureDefaults,
    sanitize: vi.fn((svg: string) => svg.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ""))
  };
});
vi.mock("mermaid", () => ({ default: { initialize, render: renderMermaid, mermaidAPI: { getConfig } } }));
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: vi.fn() }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ ask: vi.fn(), message: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ convertFileSrc: (path: string) => path }));
vi.mock("../../../src/lib/tauri", () => ({ resolveMarkdownImagePath: vi.fn() }));
vi.mock("../../../src/lib/highlight", () => ({ highlightText: vi.fn() }));
vi.mock("../../../src/lib/markdown", () => ({
  containsRemoteResourceReference: (source: string) => /https?:\/\//i.test(source),
  sanitizeMermaidSvg: sanitize
}));

function ready(html: string): MarkdownRenderState {
  return { status: "success", result: { html, headings: [], resources: [], diagnostics: [] }, error: null };
}

afterEach(() => {
  cleanup();
  initialize.mockReset();
  renderMermaid.mockReset();
  sanitize.mockClear();
});

describe("Preview Mermaid enhancement", () => {
  it("renders fenced diagrams strictly and sanitizes generated SVG", async () => {
    renderMermaid.mockResolvedValue({ svg: '<svg><script>alert(1)</script><text>safe</text></svg>' });
    const result = ready('<p>before</p><pre><code class="language-mermaid">flowchart LR\nA --&gt; B</code></pre><pre><code class="language-javascript">const answer = 42;</code></pre><p>after</p>');
    const view = render(<Preview renderState={result} filePath={null} theme="light" searchQuery="" />);

    await waitFor(() => expect(renderMermaid).toHaveBeenCalledTimes(1));
    await waitFor(() => {
      expect(view.container.querySelector(".diagram-viewer-content svg")).toBeInTheDocument();
      expect(view.container.innerHTML).not.toContain("<script");
      expect(view.container.textContent).toContain("safe");
    });
    expect(initialize).toHaveBeenCalledWith(expect.objectContaining({
      securityLevel: "strict",
      startOnLoad: false,
      htmlLabels: false,
      secure: [...secureDefaults, "htmlLabels"],
      theme: "default"
    }));
    expect(sanitize).toHaveBeenCalledWith('<svg><script>alert(1)</script><text>safe</text></svg>', { allowRemoteImages: false });

    view.rerender(<Preview renderState={result} filePath={null} theme="light" searchQuery="changed" />);
    expect(view.container.querySelector(".diagram-viewer-content svg")).toBeInTheDocument();
    expect(view.container.querySelector(".code-frame .code-language")).toHaveTextContent("javascript");
    expect(renderMermaid).toHaveBeenCalledTimes(1);

    view.rerender(<Preview renderState={result} filePath={null} theme="dark" searchQuery="changed" />);
    await waitFor(() => expect(renderMermaid).toHaveBeenCalledTimes(2));
    expect(initialize).toHaveBeenLastCalledWith(expect.objectContaining({ theme: "dark", securityLevel: "strict", htmlLabels: false }));
  });

  it("blocks remote-resource diagrams and confines syntax failures to their blocks", async () => {
    renderMermaid.mockImplementation(async (_id: string, source: string) => {
      if (source.includes("malformed")) throw new Error("bad diagram syntax");
      return { svg: "<svg><text>ok</text></svg>" };
    });
    const html = '<p>before</p><pre><code class="language-mermaid">flowchart LR\nA[https://example.test/pixel] --&gt; B</code></pre><pre><code class="language-mermaid">malformed</code></pre><p>after</p>';
    const view = render(<Preview renderState={ready(html)} filePath={null} theme="light" searchQuery="" />);

    await waitFor(() => expect(view.container.querySelectorAll(".mermaid-error")).toHaveLength(2));
    expect(renderMermaid).toHaveBeenCalledTimes(1);
    expect(view.container.textContent).toContain("Remote resources in this Mermaid diagram were blocked.");
    expect(view.container.textContent).toContain("bad diagram syntax");
    expect(view.container.querySelectorAll("p")[0]?.textContent).toBe("before");
    expect(view.container.querySelectorAll("p")[1]?.textContent).toBe("after");
  });
});
