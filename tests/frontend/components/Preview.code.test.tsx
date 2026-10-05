import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Preview } from "../../../src/components/Preview";
import type { MarkdownRenderState } from "../../../src/rendering/useMarkdownRender";

vi.mock("@tauri-apps/plugin-dialog", () => ({ ask: vi.fn(), message: vi.fn() }));
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ convertFileSrc: (path: string) => path }));
vi.mock("../../../src/lib/tauri", () => ({ resolveMarkdownImagePath: vi.fn() }));
vi.mock("../../../src/lib/highlight", () => ({ highlightText: vi.fn() }));
vi.mock("../../../src/lib/markdown", () => ({
  containsRemoteResourceReference: () => false,
  sanitizeMermaidSvg: (svg: string) => svg
}));
vi.mock("mermaid", () => ({ default: { initialize: vi.fn(), render: vi.fn() } }));

const clipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, "clipboard");
const execCommandDescriptor = Object.getOwnPropertyDescriptor(document, "execCommand");
afterEach(() => {
  cleanup();
  if (clipboardDescriptor) Object.defineProperty(navigator, "clipboard", clipboardDescriptor);
  else Reflect.deleteProperty(navigator, "clipboard");
  if (execCommandDescriptor) Object.defineProperty(document, "execCommand", execCommandDescriptor);
  else Reflect.deleteProperty(document, "execCommand");
});

function ready(html: string): MarkdownRenderState {
  return { status: "success", result: { html, headings: [], resources: [], diagnostics: [] }, error: null };
}

describe("Preview code controls", () => {
  it("adds a language badge and copies code as plain text", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    const html = '<pre><code class="hljs language-typescript">&lt;img src=x onerror=alert(1)&gt;\nconst answer = 42;</code></pre>';
    const { container } = render(<Preview renderState={ready(html)} filePath={null} theme="light" searchQuery="" />);

    expect(screen.getByText("typescript")).toBeInTheDocument();
    expect(container.querySelector(".markdown-body img")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Copy typescript code" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("<img src=x onerror=alert(1)>\nconst answer = 42;"));
    expect(screen.getByText("Copied.")).toBeInTheDocument();
  });

  it("uses a temporary plaintext field when the async clipboard is unavailable", async () => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined });
    const execCommand = vi.fn(() => {
      expect(document.querySelector("textarea")?.value).toBe("const answer = 42;");
      return true;
    });
    Object.defineProperty(document, "execCommand", { configurable: true, value: execCommand });
    render(<Preview renderState={ready('<pre><code class="language-js">const answer = 42;</code></pre>')} filePath={null} theme="light" searchQuery="" />);

    fireEvent.click(screen.getByRole("button", { name: "Copy js code" }));
    await waitFor(() => expect(screen.getByText("Copied.")).toBeInTheDocument());
    expect(execCommand).toHaveBeenCalledWith("copy");
    expect(document.querySelector("textarea")).not.toBeInTheDocument();
  });

  it("keeps copy controls active when another result has identical HTML", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    const html = '<pre><code class="language-js">const answer = 42;</code></pre><table><thead><tr><th>Value</th></tr></thead><tbody><tr><td>42</td></tr></tbody></table>';
    const firstResult = ready(html);
    const view = render(<Preview renderState={firstResult} filePath={null} theme="light" searchQuery="" />);
    expect(view.container.querySelectorAll(".table-scroll")).toHaveLength(1);

    view.rerender(<Preview renderState={ready(html)} filePath={null} theme="light" searchQuery="" />);
    expect(view.container.querySelectorAll(".table-scroll")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Copy js code" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(writeText).toHaveBeenCalledWith("const answer = 42;");
  });
});
