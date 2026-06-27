import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

afterEach(() => {
  cleanup();
});

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
    const previewScroll = container.querySelector(".preview-scroll");
    const statusStack = container.querySelector(".status-stack");

    expect(shell?.firstElementChild).toBe(toolbar);
    expect(toolbar?.nextElementSibling).toBe(statusStack);
    expect(statusStack?.nextElementSibling).toBe(workspace);
    expect(toolbar?.closest(".workspace")).toBeNull();
    expect(previewScroll?.closest(".workspace")).toBe(workspace);
    expect(previewScroll).toHaveClass("preview-scroll");
  });

  it.each(["reader", "split", "source"] as const)(
    "shows the open-file empty state in %s mode when no document is open",
    async (viewMode) => {
      vi.mocked(loadSettings).mockResolvedValue({
        ...defaultSettings,
        viewMode,
        syncScroll: false
      });

      render(<App />);

      expect(await screen.findByRole("heading", { name: "Open Markdown File" })).toBeInTheDocument();
      expect(screen.getByText("Drag and drop a Markdown file here.")).toBeInTheDocument();
      expect(screen.queryByPlaceholderText("Markdown source")).not.toBeInTheDocument();
    }
  );

  it("creates an empty source draft that stays editable when empty", async () => {
    render(<App />);

    fireEvent.click(await screen.findByTitle("New Markdown File"));

    const sourcePane = await screen.findByPlaceholderText("Markdown source");
    expect(sourcePane).toHaveValue("");

    fireEvent.change(sourcePane, { target: { value: "# Draft" } });
    expect(sourcePane).toHaveValue("# Draft");

    fireEvent.change(sourcePane, { target: { value: "" } });
    expect(sourcePane).toHaveValue("");
    expect(screen.queryByRole("heading", { name: "Open Markdown File" })).not.toBeInTheDocument();
  });
});
