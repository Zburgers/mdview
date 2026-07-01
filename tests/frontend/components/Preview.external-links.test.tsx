import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Preview } from "../../../src/components/Preview";

const {
  askMock,
  openUrlMock,
  renderMarkdownMock,
  highlightTextMock,
  convertFileSrcMock,
  mermaidInitializeMock,
  mermaidRenderMock,
  sanitizeMermaidSvgMock
} = vi.hoisted(() => ({
  askMock: vi.fn(),
  openUrlMock: vi.fn(),
  renderMarkdownMock: vi.fn(),
  highlightTextMock: vi.fn(),
  convertFileSrcMock: vi.fn((path: string) => `tauri://localhost/${path}`),
  mermaidInitializeMock: vi.fn(),
  mermaidRenderMock: vi.fn(),
  sanitizeMermaidSvgMock: vi.fn((svg: string) => svg)
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  ask: askMock
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
  renderMarkdown: renderMarkdownMock,
  sanitizeMermaidSvg: sanitizeMermaidSvgMock
}));

describe("Preview external link handling", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    askMock.mockReset();
    openUrlMock.mockReset();
    renderMarkdownMock.mockReset();
    highlightTextMock.mockReset();
    convertFileSrcMock.mockClear();
    mermaidInitializeMock.mockClear();
    mermaidRenderMock.mockClear();
    sanitizeMermaidSvgMock.mockClear();
  });

  it("confirms before opening an external https link", async () => {
    renderMarkdownMock.mockResolvedValue('<p><a href="https://example.com/docs">Docs</a></p>');
    askMock.mockResolvedValue(true);

    render(<Preview markdown="[Docs](https://example.com/docs)" filePath={null} theme="light" searchQuery="" />);

    const link = await screen.findByRole("link", { name: "Docs" });
    fireEvent.click(link);

    await waitFor(() => {
      expect(askMock).toHaveBeenCalledWith("Open this external link?\n\nhttps://example.com/docs", {
        title: "Open external link?",
        kind: "warning"
      });
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

  it("blocks non-http protocols from the external opener path", async () => {
    renderMarkdownMock.mockResolvedValue('<p><a href="mailto:alice@example.com">Email</a></p>');

    render(<Preview markdown="[Email](mailto:alice@example.com)" filePath={null} theme="light" searchQuery="" />);

    fireEvent.click(await screen.findByRole("link", { name: "Email" }));

    await waitFor(() => {
      expect(askMock).not.toHaveBeenCalled();
    });
    expect(openUrlMock).not.toHaveBeenCalled();
  });
});
