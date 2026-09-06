import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Preview } from "../../../src/components/Preview";

const {
  askMock,
  messageMock,
  openUrlMock,
  renderMarkdownMock,
  highlightTextMock,
  convertFileSrcMock,
  mermaidInitializeMock,
  mermaidRenderMock,
  sanitizeMermaidSvgMock,
  containsRemoteResourceReferenceMock
} = vi.hoisted(() => ({
  askMock: vi.fn(),
  messageMock: vi.fn(),
  openUrlMock: vi.fn(),
  renderMarkdownMock: vi.fn(),
  highlightTextMock: vi.fn(),
  convertFileSrcMock: vi.fn((path: string) => `tauri://localhost/${path}`),
  mermaidInitializeMock: vi.fn(),
  mermaidRenderMock: vi.fn(),
  sanitizeMermaidSvgMock: vi.fn((svg: string) => svg),
  containsRemoteResourceReferenceMock: vi.fn()
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  ask: askMock,
  message: messageMock
}));

vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: openUrlMock
}));

vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: convertFileSrcMock
}));

vi.mock("mermaid", () => ({
  default: {
    initialize: mermaidInitializeMock,
    render: mermaidRenderMock
  }
}));

vi.mock("../../../src/lib/highlight", () => ({
  highlightText: highlightTextMock
}));

vi.mock("../../../src/lib/markdown", () => ({
  containsRemoteResourceReference: containsRemoteResourceReferenceMock,
  renderMarkdown: renderMarkdownMock,
  sanitizeMermaidSvg: sanitizeMermaidSvgMock
}));

describe("Preview external link handling", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    askMock.mockReset();
    messageMock.mockReset();
    openUrlMock.mockReset();
    renderMarkdownMock.mockReset();
    highlightTextMock.mockReset();
    convertFileSrcMock.mockClear();
    mermaidInitializeMock.mockClear();
    mermaidRenderMock.mockReset();
    sanitizeMermaidSvgMock.mockClear();
    containsRemoteResourceReferenceMock.mockReset();
    containsRemoteResourceReferenceMock.mockReturnValue(false);
  });

  it("confirms before opening an external https link in the system browser", async () => {
    renderMarkdownMock.mockResolvedValue('<p><a href="https://example.com/docs">Docs</a></p>');
    askMock.mockResolvedValue(true);

    render(<Preview markdown="[Docs](https://example.com/docs)" filePath={null} theme="light" searchQuery="" />);

    const link = await screen.findByRole("link", { name: "Docs" });
    fireEvent.click(link);

    await waitFor(() => {
      expect(askMock).toHaveBeenCalledWith(
        "Open this link in your default browser?\n\nhttps://example.com/docs",
        {
          title: "Open external link?",
          kind: "warning"
        }
      );
    });
    expect(openUrlMock).toHaveBeenCalledWith("https://example.com/docs");
  });

  it("does not open an external link when the user declines", async () => {
    renderMarkdownMock.mockResolvedValue('<p><a href="https://example.com/docs">Docs</a></p>');
    askMock.mockResolvedValue(false);

    render(<Preview markdown="[Docs](https://example.com/docs)" filePath={null} theme="light" searchQuery="" />);

    fireEvent.click(await screen.findByRole("link", { name: "Docs" }));

    await waitFor(() => {
      expect(askMock).toHaveBeenCalledTimes(1);
    });
    expect(openUrlMock).not.toHaveBeenCalled();
  });

  it("prevents the native context menu from exposing a direct navigation path", async () => {
    renderMarkdownMock.mockResolvedValue('<p><a href="https://example.com/docs">Docs</a></p>');

    render(<Preview markdown="[Docs](https://example.com/docs)" filePath={null} theme="light" searchQuery="" />);

    const dispatched = fireEvent.contextMenu(await screen.findByRole("link", { name: "Docs" }));

    expect(dispatched).toBe(false);
    expect(askMock).not.toHaveBeenCalled();
    expect(openUrlMock).not.toHaveBeenCalled();
  });

  it("shows a native error when the system browser cannot be opened", async () => {
    renderMarkdownMock.mockResolvedValue('<p><a href="https://example.com/docs">Docs</a></p>');
    askMock.mockResolvedValue(true);
    openUrlMock.mockRejectedValue(new Error("opener unavailable"));

    render(<Preview markdown="[Docs](https://example.com/docs)" filePath={null} theme="light" searchQuery="" />);

    fireEvent.click(await screen.findByRole("link", { name: "Docs" }));

    await waitFor(() => {
      expect(messageMock).toHaveBeenCalledWith(
        "mdview could not open this link.\n\nopener unavailable",
        {
          title: "Could not open link",
          kind: "error"
        }
      );
    });
  });

  it("blocks non-http protocols and explains the decision in a native dialog", async () => {
    renderMarkdownMock.mockResolvedValue('<p><a href="mailto:alice@example.com">Email</a></p>');

    render(<Preview markdown="[Email](mailto:alice@example.com)" filePath={null} theme="light" searchQuery="" />);

    fireEvent.click(await screen.findByRole("link", { name: "Email" }));

    await waitFor(() => {
      expect(messageMock).toHaveBeenCalledWith(
        "mdview blocked this link because its protocol is not permitted.",
        {
          title: "Link blocked",
          kind: "warning"
        }
      );
    });
    expect(askMock).not.toHaveBeenCalled();
    expect(openUrlMock).not.toHaveBeenCalled();
  });

  it("blocks Mermaid diagrams with remote resources before Mermaid renders them", async () => {
    renderMarkdownMock.mockResolvedValue(
      '<pre><code class="language-mermaid">flowchart LR\ntracker@{ img: "https://example.com/tracker.png" }</code></pre>'
    );
    containsRemoteResourceReferenceMock.mockReturnValue(true);

    render(
      <Preview
        markdown={'```mermaid\nflowchart LR\ntracker@{ img: "https://example.com/tracker.png" }\n```'}
        filePath={null}
        theme="light"
        searchQuery=""
      />
    );

    expect(await screen.findByText("Remote resources in this Mermaid diagram were blocked.")).toBeInTheDocument();
    expect(mermaidRenderMock).not.toHaveBeenCalled();
  });

  it("passes the remote-image preference to Mermaid SVG sanitization", async () => {
    renderMarkdownMock.mockResolvedValue(
      '<pre><code class="language-mermaid">flowchart LR\nA --&gt; B</code></pre>'
    );
    mermaidRenderMock.mockResolvedValue({ svg: '<svg><image href="https://example.com/image.png"/></svg>' });

    render(
      <Preview
        markdown={'```mermaid\nflowchart LR\nA --> B\n```'}
        filePath={null}
        theme="light"
        searchQuery=""
        allowRemoteImages
      />
    );

    await waitFor(() => {
      expect(sanitizeMermaidSvgMock).toHaveBeenCalledWith(
        '<svg><image href="https://example.com/image.png"/></svg>',
        { allowRemoteImages: true }
      );
    });
  });
});
