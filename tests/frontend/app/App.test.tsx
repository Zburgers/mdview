import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../../../src/App";
import { defaultSettings } from "../../../src/lib/defaults";
import {
  loadSettings,
  openMarkdownDialog,
  readMarkdownFile,
  startupOpenFile,
  writeMarkdownFile
} from "../../../src/lib/tauri";

const eventMocks = vi.hoisted(() => ({
  listeners: new Map<string, (event: { payload: unknown }) => void>()
}));

const closeMock = vi.fn(() => Promise.resolve());
const destroyMock = vi.fn(() => Promise.resolve());
const minimizeMock = vi.fn(() => Promise.resolve());
const onCloseRequestedMock = vi.fn();
const startDraggingMock = vi.fn(() => Promise.resolve());
const toggleMaximizeMock = vi.fn(() => Promise.resolve());

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn((event: string, handler: (event: { payload: unknown }) => void) => {
    eventMocks.listeners.set(event, handler);
    return Promise.resolve(() => eventMocks.listeners.delete(event));
  })
}));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: vi.fn(() => ({
    close: closeMock,
    destroy: destroyMock,
    minimize: minimizeMock,
    startDragging: startDraggingMock,
    toggleMaximize: toggleMaximizeMock,
    onCloseRequested: onCloseRequestedMock
  }))
}));

vi.mock("../../../src/components/Preview", () => ({
  Preview: ({ markdown }: { markdown: string }) => (
    <article className="preview markdown-body" data-testid="preview">
      {markdown}
    </article>
  )
}));

vi.mock("../../../src/lib/tauri", () => ({
  loadSettings: vi.fn(),
  openMarkdownDialog: vi.fn(),
  readMarkdownFile: vi.fn(),
  saveMarkdownDialog: vi.fn(),
  saveSettings: vi.fn(() => Promise.resolve()),
  startupOpenFile: vi.fn(),
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
    vi.mocked(startupOpenFile).mockResolvedValue(null);
    vi.mocked(readMarkdownFile).mockResolvedValue({
      path: "/tmp/example.md",
      contents: "# Example",
      lossy: false
    });
    vi.mocked(writeMarkdownFile).mockResolvedValue("/tmp/example.md");
    closeMock.mockClear();
    onCloseRequestedMock.mockClear();
    onCloseRequestedMock.mockImplementation(() => Promise.resolve(() => undefined));
    destroyMock.mockClear();
    minimizeMock.mockClear();
    startDraggingMock.mockClear();
    toggleMaximizeMock.mockClear();
    eventMocks.listeners.clear();
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
    const titlebar = container.querySelector(".window-titlebar");
    const toolbar = container.querySelector(".toolbar");
    const workspace = container.querySelector(".workspace");
    const previewScroll = container.querySelector(".preview-scroll");
    const statusStack = container.querySelector(".status-stack");

    expect(shell?.firstElementChild).toBe(titlebar);
    expect(titlebar?.nextElementSibling).toBe(toolbar);
    expect(toolbar?.nextElementSibling).toBe(statusStack);
    expect(statusStack?.nextElementSibling).toBe(workspace);
    expect(titlebar?.closest(".workspace")).toBeNull();
    expect(toolbar?.closest(".workspace")).toBeNull();
    expect(previewScroll?.closest(".workspace")).toBe(workspace);
    expect(previewScroll).toHaveClass("preview-scroll");
  });

  it("shows file identity in the integrated titlebar", async () => {
    render(<App />);

    expect(await screen.findByText("mdview")).toBeInTheDocument();
    expect(screen.getByTestId("window-file-title")).toHaveTextContent("Untitled");

    fireEvent.click(screen.getByTitle("New Markdown File"));
    fireEvent.change(await screen.findByPlaceholderText("Markdown source"), { target: { value: "# Draft" } });

    expect(screen.getByTestId("window-file-title")).toHaveTextContent("Untitled *");
  });

  it("routes custom titlebar window controls through Tauri window APIs", async () => {
    render(<App />);

    await screen.findByRole("heading", { name: "Open Markdown File" });

    fireEvent.pointerDown(screen.getByTestId("window-drag-region"));
    fireEvent.click(screen.getByTitle("Minimize Window"));
    fireEvent.click(screen.getByTitle("Maximize or Restore Window"));
    fireEvent.click(screen.getByTitle("Close Window"));

    expect(startDraggingMock).toHaveBeenCalledTimes(1);
    expect(minimizeMock).toHaveBeenCalledTimes(1);
    expect(toggleMaximizeMock).toHaveBeenCalledTimes(1);
    expect(closeMock).toHaveBeenCalledTimes(1);
    expect(destroyMock).not.toHaveBeenCalled();
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

  it("opens the startup file supplied by the desktop file association", async () => {
    vi.mocked(startupOpenFile).mockResolvedValue("/home/naki/notes/launch.md");
    vi.mocked(readMarkdownFile).mockResolvedValue({
      path: "/home/naki/notes/launch.md",
      contents: "# Opened from Files",
      lossy: false
    });

    render(<App />);

    expect(await screen.findByTestId("preview")).toHaveTextContent("# Opened from Files");
    expect(readMarkdownFile).toHaveBeenCalledWith("/home/naki/notes/launch.md");
    expect(screen.getByTestId("window-file-title")).toHaveTextContent("launch.md");
  });

  it("prompts before replacing unsaved changes from a later native open event", async () => {
    render(<App />);

    fireEvent.click(await screen.findByTitle("New Markdown File"));
    fireEvent.change(await screen.findByPlaceholderText("Markdown source"), { target: { value: "# Draft" } });

    eventMocks.listeners.get("cli-open-file")?.({ payload: "/home/naki/notes/later.md" });

    expect(await screen.findByRole("dialog", { name: "Save changes?" })).toBeInTheDocument();
    expect(readMarkdownFile).not.toHaveBeenCalledWith("/home/naki/notes/later.md");

    vi.mocked(readMarkdownFile).mockResolvedValue({
      path: "/home/naki/notes/later.md",
      contents: "# Later",
      lossy: false
    });
    fireEvent.click(screen.getByRole("button", { name: "Don't Save" }));

    expect(await screen.findByPlaceholderText("Markdown source")).toHaveValue("# Later");
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

  it("lets the native window close when there are no unsaved changes", async () => {
    let closeHandler: ((event: { preventDefault: () => void }) => Promise<void>) | undefined;
    onCloseRequestedMock.mockImplementation((handler: typeof closeHandler) => {
      closeHandler = handler;
      return Promise.resolve(() => undefined);
    });

    render(<App />);

    await screen.findByRole("heading", { name: "Open Markdown File" });

    const preventDefault = vi.fn();
    await closeHandler?.({ preventDefault });

    expect(preventDefault).not.toHaveBeenCalled();
    expect(destroyMock).not.toHaveBeenCalled();
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

  it("destroys the window when unsaved changes are discarded during close", async () => {
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
    fireEvent.click(await screen.findByRole("button", { name: "Don't Save" }));

    await waitFor(() => expect(destroyMock).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("dialog", { name: "Save changes?" })).not.toBeInTheDocument();
  });
});
