import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Preview } from "../../../src/components/Preview";
import type { MarkdownRenderState } from "../../../src/rendering/useMarkdownRender";

const {
  askMock, messageMock, openUrlMock, highlightTextMock, convertFileSrcMock,
  resolveMarkdownImagePathMock,
  mermaidInitializeMock, mermaidRenderMock, sanitizeMermaidSvgMock,
  containsRemoteResourceReferenceMock, mermaidGetConfigMock
} = vi.hoisted(() => ({
  askMock: vi.fn(),
  messageMock: vi.fn(),
  openUrlMock: vi.fn(),
  highlightTextMock: vi.fn(),
  convertFileSrcMock: vi.fn((path: string) => `tauri://localhost/${path}`),
  resolveMarkdownImagePathMock: vi.fn(),
  mermaidInitializeMock: vi.fn(),
  mermaidRenderMock: vi.fn(),
  mermaidGetConfigMock: vi.fn(() => ({ secure: ["secure", "securityLevel", "startOnLoad", "maxTextSize", "suppressErrorRendering", "maxEdges"] })),
  sanitizeMermaidSvgMock: vi.fn((svg: string) => svg),
  containsRemoteResourceReferenceMock: vi.fn()
}));
const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;

vi.mock("@tauri-apps/plugin-dialog", () => ({ ask: askMock, message: messageMock }));
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: openUrlMock }));
vi.mock("@tauri-apps/api/core", () => ({ convertFileSrc: convertFileSrcMock }));
vi.mock("../../../src/lib/tauri", () => ({
  resolveMarkdownImagePath: resolveMarkdownImagePathMock,
}));
vi.mock("mermaid", () => ({ default: { initialize: mermaidInitializeMock, render: mermaidRenderMock, mermaidAPI: { getConfig: mermaidGetConfigMock } } }));
vi.mock("../../../src/lib/highlight", () => ({ highlightText: highlightTextMock }));
vi.mock("../../../src/lib/markdown", () => ({
  containsRemoteResourceReference: containsRemoteResourceReferenceMock,
  sanitizeMermaidSvg: sanitizeMermaidSvgMock
}));

function ready(html: string, headings: Array<{ id: string; text: string; level: 1; ordinal: number }> = []): MarkdownRenderState {
  return { status: "success", result: { html, headings, resources: [], diagnostics: [] }, error: null };
}

describe("Preview navigation and resources", () => {
  afterEach(() => {
    cleanup();
    HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
  });

  beforeEach(() => {
    askMock.mockReset();
    messageMock.mockReset();
    openUrlMock.mockReset();
    highlightTextMock.mockReset();
    convertFileSrcMock.mockClear();
    resolveMarkdownImagePathMock.mockReset();
    mermaidInitializeMock.mockClear();
    mermaidRenderMock.mockReset();
    sanitizeMermaidSvgMock.mockClear();
    containsRemoteResourceReferenceMock.mockReset();
    containsRemoteResourceReferenceMock.mockReturnValue(false);
  });

  it("authorizes local images before assigning a Tauri asset URL and opens only loaded images", async () => {
    let resolvePath!: (path: string) => void;
    resolveMarkdownImagePathMock.mockReturnValue(new Promise((resolve) => { resolvePath = resolve; }));
    render(<Preview renderState={ready('<p><img src="images/diagram.png" alt="Diagram"></p>')} filePath="/tmp/docs/readme.md" theme="light" searchQuery="" />);

    const image = await screen.findByRole("img", { name: "Diagram" });
    expect(image).not.toHaveAttribute("src");
    resolvePath("/tmp/docs/images/diagram.png");
    await waitFor(() => expect(image).toHaveAttribute("src", "tauri://localhost//tmp/docs/images/diagram.png"));
    expect(resolveMarkdownImagePathMock).toHaveBeenCalledWith("/tmp/docs/readme.md", "images/diagram.png");
    fireEvent.load(image);
    fireEvent.click(image);
    expect(await screen.findByRole("dialog", { name: "Image preview: Diagram" })).toBeInTheDocument();
  });

  it("shows a path-free placeholder when Rust rejects a local image", async () => {
    resolveMarkdownImagePathMock.mockRejectedValue(new Error("private path details"));
    render(<Preview renderState={ready('<img src="../secret/photo.png" alt="Private photo">')} filePath="/tmp/docs/readme.md" theme="light" searchQuery="" />);

    expect(await screen.findByRole("img", { name: /Private photo.*could not be opened/i })).toBeInTheDocument();
    expect(screen.queryByText(/private path details/i)).not.toBeInTheDocument();
  });

  it("waits for a shared render result before resolving a pending heading request", async () => {
    const scrollIntoView = vi.fn();
    HTMLElement.prototype.scrollIntoView = scrollIntoView;
    const onComplete = vi.fn();
    const view = render(<Preview renderState={{ status: "loading", result: null, error: null }} filePath="/tmp/note.md" theme="light" searchQuery="" scrollToHeading="target" onHeadingNavigationComplete={onComplete} />);

    expect(onComplete).not.toHaveBeenCalled();
    view.rerender(<Preview renderState={ready('<h1 id="target">Target</h1>', [{ id: "target", text: "Target", level: 1, ordinal: 0 }])} filePath="/tmp/note.md" theme="light" searchQuery="" scrollToHeading="target" onHeadingNavigationComplete={onComplete} />);
    await waitFor(() => expect(onComplete).toHaveBeenCalledOnce());
    expect(scrollIntoView).toHaveBeenCalledOnce();
  });

  it("confirms before opening an external https link in the system browser", async () => {
    askMock.mockResolvedValue(true);
    render(<Preview renderState={ready('<a href="https://example.com/docs">Docs</a>')} filePath={null} theme="light" searchQuery="" />);
    fireEvent.click(await screen.findByRole("link", { name: "Docs" }));
    await waitFor(() => expect(askMock).toHaveBeenCalledWith("Open this link in your default browser?\n\nhttps://example.com/docs", { title: "Open external link?", kind: "warning" }));
    expect(openUrlMock).toHaveBeenCalledWith("https://example.com/docs");
  });

  it("does not open an external link when the user declines", async () => {
    askMock.mockResolvedValue(false);
    render(<Preview renderState={ready('<a href="https://example.com/docs">Docs</a>')} filePath={null} theme="light" searchQuery="" />);
    fireEvent.click(await screen.findByRole("link", { name: "Docs" }));
    await waitFor(() => expect(askMock).toHaveBeenCalledOnce());
    expect(openUrlMock).not.toHaveBeenCalled();
  });

  it("blocks the native context menu from exposing a direct link path", async () => {
    render(<Preview renderState={ready('<a href="https://example.com/docs">Docs</a>')} filePath={null} theme="light" searchQuery="" />);
    expect(fireEvent.contextMenu(await screen.findByRole("link", { name: "Docs" }))).toBe(false);
    expect(askMock).not.toHaveBeenCalled();
  });

  it("routes relative Markdown links through Rust only after a click", async () => {
    const onOpenLocalLink = vi.fn();
    render(<Preview renderState={ready('<a href="../guide%20one.md#Install">Guide</a>')} filePath="/tmp/docs/current.md" theme="light" searchQuery="" onOpenLocalLink={onOpenLocalLink} />);
    const link = await screen.findByRole("link", { name: "Guide" });
    fireEvent.click(link);
    expect(onOpenLocalLink).toHaveBeenCalledWith("../guide%20one.md", "Install");
  });

  it("keeps same-document anchors scoped to this preview and generated heading IDs", async () => {
    const scrollIntoView = vi.fn();
    HTMLElement.prototype.scrollIntoView = scrollIntoView;
    render(<Preview renderState={ready('<a href="#heading">Jump</a><h1 id="heading">Heading</h1>', [{ id: "heading", text: "Heading", level: 1, ordinal: 0 }])} filePath={null} theme="light" searchQuery="" />);
    fireEvent.click(await screen.findByRole("link", { name: "Jump" }));
    expect(scrollIntoView).toHaveBeenCalledOnce();
  });

  it("blocks non-http protocols and explains the policy", async () => {
    render(<Preview renderState={ready('<a href="mailto:alice@example.com">Email</a>')} filePath={null} theme="light" searchQuery="" />);
    fireEvent.click(await screen.findByRole("link", { name: "Email" }));
    await waitFor(() => expect(messageMock).toHaveBeenCalledWith("mdview blocked this link because its protocol is not permitted.", { title: "Link blocked", kind: "warning" }));
    expect(openUrlMock).not.toHaveBeenCalled();
  });

  it("blocks Mermaid diagrams with remote resources before Mermaid renders them", async () => {
    containsRemoteResourceReferenceMock.mockReturnValue(true);
    render(<Preview renderState={ready('<pre><code class="language-mermaid">flowchart LR\ntracker@{ img: "https://example.com/tracker.png" }</code></pre>')} filePath={null} theme="light" searchQuery="" />);
    expect(await screen.findByText("Remote resources in this Mermaid diagram were blocked.")).toBeInTheDocument();
    expect(mermaidRenderMock).not.toHaveBeenCalled();
  });
});
