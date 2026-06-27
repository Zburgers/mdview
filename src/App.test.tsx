import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { defaultSettings } from "./lib/defaults";
import { loadSettings } from "./lib/tauri";

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(() => Promise.resolve(() => undefined))
}));

vi.mock("./components/Preview", () => ({
  Preview: ({ markdown }: { markdown: string }) => (
    <article className="preview markdown-body" data-testid="preview">
      {markdown}
    </article>
  )
}));

vi.mock("./lib/tauri", () => ({
  loadSettings: vi.fn(),
  openMarkdownDialog: vi.fn(),
  readMarkdownFile: vi.fn(),
  saveMarkdownDialog: vi.fn(),
  saveSettings: vi.fn(() => Promise.resolve()),
  writeMarkdownFile: vi.fn()
}));

const matchMediaMock = vi.fn(() => ({
  matches: false,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn()
}));

describe("App desktop layout", () => {
  beforeEach(() => {
    vi.mocked(loadSettings).mockResolvedValue({
      ...defaultSettings,
      viewMode: "split",
      syncScroll: false
    });
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: matchMediaMock
    });
  });

  it("keeps the toolbar outside the scrollable markdown workspace", async () => {
    const { container } = render(<App />);

    await waitFor(() => {
      expect(container.querySelector(".workspace.mode-split")).toBeInTheDocument();
    });

    const shell = container.querySelector(".app-shell");
    const toolbar = container.querySelector(".toolbar");
    const workspace = container.querySelector(".workspace");
    const sourcePane = screen.getByPlaceholderText("Markdown source");
    const previewScroll = container.querySelector(".preview-scroll");

    expect(shell?.firstElementChild).toBe(toolbar);
    expect(toolbar?.closest(".workspace")).toBeNull();
    expect(sourcePane.closest(".workspace")).toBe(workspace);
    expect(previewScroll?.closest(".workspace")).toBe(workspace);
    expect(sourcePane).toHaveClass("source-pane");
    expect(previewScroll).toHaveClass("preview-scroll");
  });
});
