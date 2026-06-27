import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { defaultSettings } from "./lib/defaults";
import { loadSettings, openMarkdownDialog, readMarkdownFile, writeMarkdownFile } from "./lib/tauri";

const destroyMock = vi.fn(() => Promise.resolve());
const onCloseRequestedMock = vi.fn();

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(() => Promise.resolve(() => undefined))
}));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: vi.fn(() => ({
    destroy: destroyMock,
    onCloseRequested: onCloseRequestedMock
  }))
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
    vi.mocked(openMarkdownDialog).mockResolvedValue(null);
    vi.mocked(readMarkdownFile).mockResolvedValue({
      path: "/tmp/example.md",
      contents: "# Example",
      lossy: false
    });
    vi.mocked(writeMarkdownFile).mockResolvedValue();
    onCloseRequestedMock.mockImplementation(() => Promise.resolve(() => undefined));
    destroyMock.mockClear();
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

  it("prompts before discarding unsaved changes when opening another file", async () => {
    vi.mocked(openMarkdownDialog).mockResolvedValue("/tmp/second.md");
    vi.mocked(readMarkdownFile).mockResolvedValue({
      path: "/tmp/second.md",
      contents: "# Second",
      lossy: false
    });

    render(<App />);

    fireEvent.click(await screen.findByTitle("New Markdown File"));
    fireEvent.change(await screen.findByPlaceholderText("Markdown source"), { target: { value: "# Draft" } });
    fireEvent.click(screen.getByTitle("Open Markdown File"));

    expect(await screen.findByRole("dialog", { name: "Save changes?" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Don't Save" }));

    expect(await screen.findByPlaceholderText("Markdown source")).toHaveValue("# Second");
    expect(screen.queryByRole("dialog", { name: "Save changes?" })).not.toBeInTheDocument();
  });

  it("cancels closing the window when the user cancels the unsaved-changes dialog", async () => {
    let closeHandler: ((event: { preventDefault: () => void }) => Promise<void>) | undefined;
    onCloseRequestedMock.mockImplementation((handler: typeof closeHandler) => {
      closeHandler = handler;
      return Promise.resolve(() => undefined);
    });

    render(<App />);

    fireEvent.click(await screen.findByTitle("New Markdown File"));
    fireEvent.change(await screen.findByPlaceholderText("Markdown source"), { target: { value: "# Draft" } });

    const preventDefault = vi.fn();
    await closeHandler?.({ preventDefault });

    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole("dialog", { name: "Save changes?" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(destroyMock).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog", { name: "Save changes?" })).not.toBeInTheDocument();
  });
});
