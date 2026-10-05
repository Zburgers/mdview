import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../../../src/App";
import { defaultSettings } from "../../../src/lib/defaults";
import {
  checkForUpdates,
  getNativeAppVersion,
  loadSettings,
  openMarkdownWindow,
  pathsAlias,
  openMarkdownDialog,
  readMarkdownFile,
  resolveMarkdownLinkTarget,
  saveMarkdownDialog,
  saveSettings,
  startupOpenFile,
  writeMarkdownFile,
  writeAttachmentBytes
} from "../../../src/lib/tauri";

const eventMocks = vi.hoisted(() => ({
  listeners: new Map<string, (event: { payload: unknown }) => void>()
}));
const renderMarkdownDocumentMock = vi.hoisted(() => vi.fn());
vi.mock("../../../src/rendering/render", () => ({ renderMarkdownDocument: renderMarkdownDocumentMock }));

const closeMock = vi.fn(() => Promise.resolve());
const destroyMock = vi.fn(() => Promise.resolve());
const minimizeMock = vi.fn(() => Promise.resolve());
const onCloseRequestedMock = vi.fn();
const startDraggingMock = vi.fn(() => Promise.resolve());
const startResizeDraggingMock = vi.fn(() => Promise.resolve());
const isMaximizedMock = vi.fn(() => Promise.resolve(false));
const isFullscreenMock = vi.fn(() => Promise.resolve(false));
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
    startResizeDragging: startResizeDraggingMock,
    isMaximized: isMaximizedMock,
    isFullscreen: isFullscreenMock,
    toggleMaximize: toggleMaximizeMock,
    onCloseRequested: onCloseRequestedMock
  }))
}));

vi.mock("../../../src/components/Preview", () => ({
  Preview: ({ renderState, onOpenWikilink, onToggleTask, onOpenLocalLink }: {
    renderState: { status: string; result: { html: string } | null };
    onOpenWikilink?: (target: string) => void;
    onToggleTask?: (line: number) => void;
    onOpenLocalLink?: (path: string, heading?: string) => void;
  }) => {
    const html = renderState.status === "success" ? renderState.result?.html ?? "" : "";
    return (
    <>
      <article className="preview markdown-body" data-testid="preview">
        <span dangerouslySetInnerHTML={{ __html: html }} />
      </article>
      {html.includes("[[Target]]") ? (
        <button type="button" onClick={() => onOpenWikilink?.("Target")}>Open test wikilink</button>
      ) : null}
      {html.includes("1. [ ] ordered task") ? (
        <button type="button" onClick={() => onToggleTask?.(0)}>Toggle test task</button>
      ) : null}
      {html.includes("[Guide](../guide.md#Install)") ? (
        <button type="button" onClick={() => onOpenLocalLink?.("../guide.md", "Install")}>Open test local link</button>
      ) : null}
    </>
    );
  }
}));

vi.mock("../../../src/lib/tauri", () => ({
  loadSettings: vi.fn(),
  openMarkdownDialog: vi.fn(),
  readMarkdownFile: vi.fn(),
  saveMarkdownDialog: vi.fn(),
  saveSettings: vi.fn(() => Promise.resolve()),
  startupOpenFile: vi.fn(),
  writeMarkdownFile: vi.fn(),
  pathsAlias: vi.fn(() => Promise.resolve(false)),
  resolveMarkdownLinkTarget: vi.fn(),
  writeAttachmentBytes: vi.fn(),
  checkForUpdates: vi.fn(),
  getNativeAppVersion: vi.fn(() => Promise.resolve("1.2.4")),
  openMarkdownWindow: vi.fn()
}));

const matchMediaMock = vi.fn(() => ({
  matches: false,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn()
}));

afterEach(() => {
  cleanup();
});

function makeOversizedFile(name: string, type: string) {
  const file = new File([], name, { type });
  const arrayBuffer = vi.fn(async () => new ArrayBuffer(0));
  Object.defineProperty(file, "size", { value: 20 * 1024 * 1024 + 1 });
  Object.defineProperty(file, "arrayBuffer", { value: arrayBuffer });
  return { file, arrayBuffer };
}

describe("App desktop layout", () => {
  beforeEach(() => {
    renderMarkdownDocumentMock.mockReset();
    renderMarkdownDocumentMock.mockImplementation(async (markdown: string) => ({
      html: `<p>${markdown}</p>`, headings: [], resources: [], diagnostics: []
    }));
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
    vi.mocked(writeMarkdownFile).mockClear();
    vi.mocked(readMarkdownFile).mockClear();
    vi.mocked(pathsAlias).mockClear();
    vi.mocked(pathsAlias).mockResolvedValue(false);
    vi.mocked(writeAttachmentBytes).mockClear();
    vi.mocked(writeAttachmentBytes).mockResolvedValue("/tmp/assets/photo.png");
    vi.mocked(resolveMarkdownLinkTarget).mockReset();
    vi.mocked(checkForUpdates).mockResolvedValue({ status: "current", currentVersion: "1.2.2" });
    vi.mocked(openMarkdownWindow).mockResolvedValue(undefined);
    vi.mocked(saveSettings).mockClear();
    closeMock.mockClear();
    onCloseRequestedMock.mockClear();
    onCloseRequestedMock.mockImplementation(() => Promise.resolve(() => undefined));
    destroyMock.mockClear();
    minimizeMock.mockClear();
    startDraggingMock.mockClear();
    startResizeDraggingMock.mockClear();
    isMaximizedMock.mockClear();
    isFullscreenMock.mockClear();
    toggleMaximizeMock.mockClear();
    eventMocks.listeners.clear();
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: matchMediaMock
    });
  });

  it("renders once per Markdown change and does not parse when search changes", async () => {
    render(<App />);
    fireEvent.click(await screen.findByTitle("New Markdown File"));
    const source = await screen.findByPlaceholderText("Markdown source");
    await waitFor(() => expect(renderMarkdownDocumentMock).toHaveBeenCalled());
    const initialCalls = renderMarkdownDocumentMock.mock.calls.length;

    fireEvent.change(source, { target: { value: "# First heading" } });
    await waitFor(() => expect(renderMarkdownDocumentMock).toHaveBeenCalledTimes(initialCalls + 1));
    const markdownCalls = renderMarkdownDocumentMock.mock.calls.length;
    fireEvent.change(screen.getByPlaceholderText("Search document"), { target: { value: "heading" } });

    await waitFor(() => expect(screen.getByPlaceholderText("Search document")).toHaveValue("heading"));
    expect(renderMarkdownDocumentMock).toHaveBeenCalledTimes(markdownCalls);
  });

  it("resolves ordinary relative links and opens them through the existing tab path", async () => {
    vi.mocked(openMarkdownDialog).mockResolvedValue("/tmp/docs/current.md");
    vi.mocked(readMarkdownFile).mockImplementation(async (path) => ({
      path,
      contents: path === "/tmp/docs/current.md" ? "[Guide](../guide.md#Install)" : "# Install",
      lossy: false
    }));
    vi.mocked(resolveMarkdownLinkTarget).mockResolvedValue("/tmp/guide.md");

    render(<App />);
    fireEvent.click(await screen.findByTitle("Open Markdown File"));
    fireEvent.click(await screen.findByRole("button", { name: "Open test local link" }));

    await waitFor(() => expect(resolveMarkdownLinkTarget).toHaveBeenCalledWith("/tmp/docs/current.md", "../guide.md"));
    await waitFor(() => expect(readMarkdownFile).toHaveBeenCalledWith("/tmp/guide.md"));
    expect(screen.getByRole("tab", { name: "guide.md" })).toHaveAttribute("aria-selected", "true");
  });

  it("waits for saved settings before writing preferences", async () => {
    let resolveSettings!: (settings: typeof defaultSettings) => void;
    vi.mocked(loadSettings).mockReturnValue(
      new Promise((resolve) => {
        resolveSettings = resolve;
      })
    );

    render(<App />);

    expect(saveSettings).not.toHaveBeenCalled();

    const loaded = { ...defaultSettings, theme: "dark" as const, allowRemoteImages: true };
    resolveSettings(loaded);

    await waitFor(() => {
      expect(saveSettings).toHaveBeenCalledWith(loaded);
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
    const tabStrip = container.querySelector(".tab-strip");

    expect(shell?.firstElementChild).toBe(titlebar);
    expect(titlebar?.nextElementSibling).toBe(toolbar);
    expect(toolbar?.nextElementSibling).toBe(tabStrip);
    expect(tabStrip?.nextElementSibling).toBe(statusStack);
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

  it("uses manual titlebar dragging and native maximize on double click", async () => {
    render(<App />);
    const dragRegion = await screen.findByTestId("window-drag-region");

    fireEvent.pointerDown(dragRegion, { button: 2 });
    fireEvent.pointerDown(dragRegion, { button: 0, detail: 2 });
    fireEvent.doubleClick(dragRegion);

    expect(startDraggingMock).not.toHaveBeenCalled();
    expect(toggleMaximizeMock).toHaveBeenCalledTimes(1);
    expect(dragRegion).not.toHaveAttribute("data-tauri-drag-region");
  });

  it("starts native resize from every edge and corner", async () => {
    render(<App />);
    const handles = document.querySelectorAll<HTMLElement>("[data-resize-direction]");
    expect(handles).toHaveLength(8);

    for (const handle of handles) {
      fireEvent.pointerDown(handle, { button: 0 });
    }

    await waitFor(() => expect(startResizeDraggingMock).toHaveBeenCalledTimes(8));
    expect([...handles].map((handle) => handle.dataset.resizeDirection)).toEqual([
      "North", "South", "East", "West", "NorthEast", "NorthWest", "SouthEast", "SouthWest"
    ]);
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

  it("toggles ordered-list tasks in the source", async () => {
    render(<App />);

    fireEvent.click(await screen.findByTitle("New Markdown File"));
    fireEvent.click(screen.getByTitle("Split"));
    const source = await screen.findByPlaceholderText("Markdown source");
    fireEvent.change(source, { target: { value: "1. [ ] ordered task" } });
    fireEvent.click(await screen.findByRole("button", { name: "Toggle test task" }));

    await waitFor(() => expect(source).toHaveValue("1. [x] ordered task"));
    expect(screen.getByRole("tab", { name: "Untitled unsaved" })).toBeInTheDocument();
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

  it("opens a later native open event in another tab when the current file is dirty", async () => {
    render(<App />);

    fireEvent.click(await screen.findByTitle("New Markdown File"));
    fireEvent.change(await screen.findByPlaceholderText("Markdown source"), { target: { value: "# Draft" } });

    vi.mocked(readMarkdownFile).mockResolvedValue({
      path: "/home/naki/notes/later.md",
      contents: "# Later",
      lossy: false
    });
    eventMocks.listeners.get("cli-open-file")?.({ payload: "/home/naki/notes/later.md" });

    expect(await screen.findByPlaceholderText("Markdown source")).toHaveValue("# Later");
    expect(screen.getByRole("tab", { name: "Untitled unsaved" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "later.md" })).toHaveAttribute("aria-selected", "true");
  });

  it("opens another file in a new tab without discarding unsaved changes", async () => {
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

    expect(await screen.findByPlaceholderText("Markdown source")).toHaveValue("# Second");
    expect(screen.getByRole("tab", { name: "Untitled unsaved" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "second.md" })).toHaveAttribute("aria-selected", "true");

    fireEvent.click(screen.getByRole("tab", { name: "Untitled unsaved" }));
    expect(await screen.findByPlaceholderText("Markdown source")).toHaveValue("# Draft");
  });

  it("warns before unload when a background tab has unsaved changes", async () => {
    vi.mocked(openMarkdownDialog).mockResolvedValueOnce("/tmp/first.md").mockResolvedValueOnce("/tmp/second.md");
    vi.mocked(readMarkdownFile).mockImplementation(async (path) => ({ path, contents: `# ${path}`, lossy: false }));

    render(<App />);

    fireEvent.click(await screen.findByTitle("Open Markdown File"));
    await screen.findByRole("tab", { name: "first.md" });
    fireEvent.click(screen.getByTitle("Open Markdown File"));
    await screen.findByRole("tab", { name: "second.md" });
    fireEvent.click(screen.getByRole("tab", { name: "first.md" }));
    fireEvent.change(await screen.findByPlaceholderText("Markdown source"), { target: { value: "# First edits" } });
    fireEvent.click(screen.getByRole("tab", { name: "second.md" }));

    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
  });

  it("tries wikilink path guesses in order until one opens", async () => {
    vi.mocked(openMarkdownDialog).mockResolvedValue("/tmp/current.md");
    vi.mocked(readMarkdownFile).mockImplementation(async (path) => {
      if (path === "/tmp/Target.md") throw new Error("Could not read file: No such file or directory (os error 2)");
      return { path, contents: path === "/tmp/current.md" ? "[[Target]]" : "# Found target", lossy: false };
    });

    render(<App />);
    fireEvent.click(await screen.findByTitle("Open Markdown File"));
    fireEvent.click(await screen.findByRole("button", { name: "Open test wikilink" }));

    await waitFor(() => expect(screen.getByPlaceholderText("Markdown source")).toHaveValue("# Found target"));
    expect(vi.mocked(readMarkdownFile).mock.calls.map(([path]) => path)).toEqual([
      "/tmp/current.md",
      "/tmp/Target.md",
      "Target.md"
    ]);
  });

  it("prefers a sibling wikilink target over a recent file with the same basename", async () => {
    vi.mocked(loadSettings).mockResolvedValue({ ...defaultSettings, viewMode: "split", recentFiles: ["/recent/Target.md"] });
    vi.mocked(openMarkdownDialog).mockResolvedValue("/tmp/current.md");
    vi.mocked(readMarkdownFile).mockImplementation(async (path) => {
      return { path, contents: path === "/tmp/current.md" ? "[[Target]]" : "# Local target", lossy: false };
    });

    render(<App />);
    fireEvent.click(await screen.findByTitle("Open Markdown File"));
    fireEvent.click(await screen.findByRole("button", { name: "Open test wikilink" }));

    await waitFor(() => expect(screen.getByPlaceholderText("Markdown source")).toHaveValue("# Local target"));
    expect(vi.mocked(readMarkdownFile).mock.calls.map(([path]) => path)).toEqual([
      "/tmp/current.md",
      "/tmp/Target.md"
    ]);
  });

  it("uses a unique recent wikilink match when the sibling note is missing", async () => {
    vi.mocked(loadSettings).mockResolvedValue({ ...defaultSettings, viewMode: "split", recentFiles: ["/recent/Target.md"] });
    vi.mocked(openMarkdownDialog).mockResolvedValue("/tmp/current.md");
    vi.mocked(readMarkdownFile).mockImplementation(async (path) => {
      if (path === "/tmp/Target.md") throw new Error("Could not read file: No such file or directory (os error 2)");
      return { path, contents: path === "/tmp/current.md" ? "[[Target]]" : "# Recent target", lossy: false };
    });

    render(<App />);
    fireEvent.click(await screen.findByTitle("Open Markdown File"));
    fireEvent.click(await screen.findByRole("button", { name: "Open test wikilink" }));

    await waitFor(() => expect(screen.getByPlaceholderText("Markdown source")).toHaveValue("# Recent target"));
    expect(vi.mocked(readMarkdownFile).mock.calls.map(([path]) => path)).toEqual([
      "/tmp/current.md",
      "/tmp/Target.md",
      "/recent/Target.md"
    ]);
  });

  it("does not guess when a wikilink matches multiple recent files", async () => {
    vi.mocked(loadSettings).mockResolvedValue({
      ...defaultSettings,
      viewMode: "split",
      recentFiles: ["/recent/a/Target.md", "/recent/b/Target.md"]
    });
    vi.mocked(openMarkdownDialog).mockResolvedValue("/tmp/current.md");
    vi.mocked(readMarkdownFile).mockImplementation(async (path) => {
      if (path === "/tmp/current.md") return { path, contents: "[[Target]]", lossy: false };
      throw new Error("Could not read file: No such file or directory (os error 2)");
    });

    render(<App />);
    fireEvent.click(await screen.findByTitle("Open Markdown File"));
    fireEvent.click(await screen.findByRole("button", { name: "Open test wikilink" }));

    expect(await screen.findByText("Linked note is ambiguous: Target")).toBeInTheDocument();
    expect(vi.mocked(readMarkdownFile).mock.calls.map(([path]) => path)).toEqual([
      "/tmp/current.md",
      "/tmp/Target.md"
    ]);
  });

  it("stops wikilink fallback after a non-missing open failure", async () => {
    vi.mocked(openMarkdownDialog).mockResolvedValue("/tmp/current.md");
    vi.mocked(readMarkdownFile).mockImplementation(async (path) => {
      if (path === "/tmp/Target.md") throw new Error("Permission denied");
      return { path, contents: "[[Target]]", lossy: false };
    });

    render(<App />);
    fireEvent.click(await screen.findByTitle("Open Markdown File"));
    fireEvent.click(await screen.findByRole("button", { name: "Open test wikilink" }));

    expect(await screen.findByText("Permission denied")).toBeInTheDocument();
    expect(vi.mocked(readMarkdownFile).mock.calls.map(([path]) => path)).toEqual([
      "/tmp/current.md",
      "/tmp/Target.md"
    ]);
  });

  it("reopens a dirty file in its existing tab without replacing edits", async () => {
    vi.mocked(openMarkdownDialog).mockResolvedValue("/tmp/example.md");
    vi.mocked(readMarkdownFile)
      .mockResolvedValueOnce({ path: "/tmp/example.md", contents: "# Original", lossy: false })
      .mockResolvedValueOnce({ path: "/tmp/example.md", contents: "# On disk", lossy: false });

    render(<App />);

    fireEvent.click(await screen.findByTitle("Open Markdown File"));
    const source = await screen.findByPlaceholderText("Markdown source");
    fireEvent.change(source, { target: { value: "# My edits" } });
    const readCount = vi.mocked(readMarkdownFile).mock.calls.length;
    fireEvent.click(screen.getByTitle("Open Markdown File"));

    await waitFor(() => expect(vi.mocked(readMarkdownFile).mock.calls.length).toBe(readCount));
    expect(await screen.findByPlaceholderText("Markdown source")).toHaveValue("# My edits");
    expect(screen.getAllByRole("tab", { name: "example.md unsaved" })).toHaveLength(1);
  });

  it("focuses a dirty tab when the same file is opened through a filesystem alias", async () => {
    vi.mocked(openMarkdownDialog)
      .mockResolvedValueOnce("/tmp/example.md")
      .mockResolvedValueOnce("/tmp/aliases/example.md");
    vi.mocked(readMarkdownFile).mockResolvedValue({
      path: "/tmp/example.md",
      contents: "# Original",
      lossy: false
    });
    vi.mocked(pathsAlias).mockResolvedValue(true);

    render(<App />);

    fireEvent.click(await screen.findByTitle("Open Markdown File"));
    const source = await screen.findByPlaceholderText("Markdown source");
    fireEvent.change(source, { target: { value: "# My edits" } });
    const readCount = vi.mocked(readMarkdownFile).mock.calls.length;
    fireEvent.click(screen.getByTitle("Open Markdown File"));

    await waitFor(() => expect(pathsAlias).toHaveBeenCalledWith("/tmp/aliases/example.md", ["/tmp/example.md"]));
    expect(vi.mocked(readMarkdownFile)).toHaveBeenCalledTimes(readCount);
    expect(await screen.findByPlaceholderText("Markdown source")).toHaveValue("# My edits");
    expect(screen.getAllByRole("tab", { name: "example.md unsaved" })).toHaveLength(1);
  });

  it("does not Save As over a path owned by another open tab", async () => {
    vi.mocked(openMarkdownDialog)
      .mockResolvedValueOnce("/tmp/first.md")
      .mockResolvedValueOnce("/tmp/second.md");
    vi.mocked(readMarkdownFile).mockImplementation(async (path) => ({
      path,
      contents: "# " + path,
      lossy: false
    }));
    vi.mocked(saveMarkdownDialog).mockResolvedValue("/tmp/folder/../second.md");
    vi.mocked(pathsAlias).mockResolvedValueOnce(false).mockResolvedValueOnce(false).mockResolvedValue(true);

    render(<App />);

    fireEvent.click(await screen.findByTitle("Open Markdown File"));
    await screen.findByRole("tab", { name: "first.md" });
    fireEvent.click(screen.getByTitle("Open Markdown File"));
    await screen.findByRole("tab", { name: "second.md" });
    fireEvent.click(screen.getByRole("tab", { name: "first.md" }));
    fireEvent.click(screen.getByTitle("Save As"));

    await waitFor(() => expect(saveMarkdownDialog).toHaveBeenCalled());
    expect(await screen.findByText(/already open in another tab/i)).toBeInTheDocument();
    expect(writeMarkdownFile).not.toHaveBeenCalled();
  });

  it("checks native path identity after applying the Markdown extension rule", async () => {
    vi.mocked(openMarkdownDialog).mockResolvedValueOnce("/tmp/first.md").mockResolvedValueOnce("/tmp/second.md");
    vi.mocked(readMarkdownFile).mockImplementation(async (path) => ({ path, contents: "# File", lossy: false }));
    vi.mocked(saveMarkdownDialog).mockResolvedValue("/tmp/other-name");

    render(<App />);
    fireEvent.click(await screen.findByTitle("Open Markdown File"));
    await screen.findByRole("tab", { name: "first.md" });
    fireEvent.click(screen.getByTitle("Open Markdown File"));
    await screen.findByRole("tab", { name: "second.md" });
    fireEvent.click(screen.getByRole("tab", { name: "first.md" }));
    fireEvent.click(screen.getByTitle("Save As"));

    await waitFor(() => expect(pathsAlias).toHaveBeenCalledWith("/tmp/other-name.md", ["/tmp/second.md"]));
  });

  it("writes pasted image bytes through the constrained native attachment command", async () => {
    vi.mocked(openMarkdownDialog).mockResolvedValue("/tmp/example.md");
    vi.mocked(readMarkdownFile).mockResolvedValue({ path: "/tmp/example.md", contents: "# Example", lossy: false });
    vi.mocked(writeAttachmentBytes).mockResolvedValue("/tmp/assets/pasted.png");
    render(<App />);
    fireEvent.click(await screen.findByTitle("Open Markdown File"));
    const source = await screen.findByPlaceholderText("Markdown source");
    const image = new File([new Uint8Array([1, 2, 3])], "pasted.png", { type: "image/png" });

    fireEvent.paste(source, { clipboardData: { files: [image] } });

    await waitFor(() => expect(writeAttachmentBytes).toHaveBeenCalledWith(
      "/tmp/example.md",
      "pasted.png",
      expect.any(Uint8Array)
    ));
  });

  it("rejects oversized pasted files before reading their bytes", async () => {
    vi.mocked(openMarkdownDialog).mockResolvedValue("/tmp/example.md");
    vi.mocked(readMarkdownFile).mockResolvedValue({ path: "/tmp/example.md", contents: "# Example", lossy: false });
    render(<App />);
    fireEvent.click(await screen.findByTitle("Open Markdown File"));
    const source = await screen.findByPlaceholderText("Markdown source");
    const { file, arrayBuffer } = makeOversizedFile("large.png", "image/png");

    fireEvent.paste(source, { clipboardData: { files: [file] } });

    expect(await screen.findByText("File too large (20 MB limit): large.png")).toBeInTheDocument();
    expect(arrayBuffer).not.toHaveBeenCalled();
    expect(writeAttachmentBytes).not.toHaveBeenCalled();
  });

  it("writes pathless dropped file bytes through the constrained native attachment command", async () => {
    vi.mocked(openMarkdownDialog).mockResolvedValue("/tmp/example.md");
    vi.mocked(readMarkdownFile).mockResolvedValue({ path: "/tmp/example.md", contents: "# Example", lossy: false });
    vi.mocked(writeAttachmentBytes).mockResolvedValue("/tmp/assets/report.pdf");
    render(<App />);
    fireEvent.click(await screen.findByTitle("Open Markdown File"));
    const source = await screen.findByPlaceholderText("Markdown source");
    const file = new File([new Uint8Array([4, 5, 6])], "report.pdf", { type: "application/pdf" });

    fireEvent.drop(source, { dataTransfer: { files: [file] } });

    await waitFor(() => expect(writeAttachmentBytes).toHaveBeenCalledWith(
      "/tmp/example.md",
      "report.pdf",
      expect.any(Uint8Array)
    ));
  });

  it("rejects oversized pathless drops before reading their bytes", async () => {
    vi.mocked(openMarkdownDialog).mockResolvedValue("/tmp/example.md");
    vi.mocked(readMarkdownFile).mockResolvedValue({ path: "/tmp/example.md", contents: "# Example", lossy: false });
    render(<App />);
    fireEvent.click(await screen.findByTitle("Open Markdown File"));
    const source = await screen.findByPlaceholderText("Markdown source");
    const { file, arrayBuffer } = makeOversizedFile("large.png", "image/png");

    fireEvent.drop(source, { dataTransfer: { files: [file] } });

    expect(await screen.findByText("File too large (20 MB limit): large.png")).toBeInTheDocument();
    expect(arrayBuffer).not.toHaveBeenCalled();
    expect(writeAttachmentBytes).not.toHaveBeenCalled();
  });

  it("keeps edits dirty when they change while a save is pending", async () => {
    vi.mocked(openMarkdownDialog).mockResolvedValue("/tmp/example.md");
    vi.mocked(readMarkdownFile).mockResolvedValue({
      path: "/tmp/example.md",
      contents: "# Original",
      lossy: false
    });
    let finishWrite!: (path: string) => void;
    vi.mocked(writeMarkdownFile).mockReturnValue(
      new Promise((resolve) => {
        finishWrite = resolve;
      })
    );

    render(<App />);

    fireEvent.click(await screen.findByTitle("Open Markdown File"));
    const source = await screen.findByPlaceholderText("Markdown source");
    fireEvent.change(source, { target: { value: "# Saved snapshot" } });
    fireEvent.click(screen.getByTitle("Save"));
    fireEvent.change(source, { target: { value: "# Newer edits" } });
    finishWrite("/tmp/example.md");

    await screen.findByText(/Saved/);
    expect(screen.getByRole("tab", { name: "example.md unsaved" })).toBeInTheDocument();
    expect(await screen.findByPlaceholderText("Markdown source")).toHaveValue("# Newer edits");
  });

  it("saves the inactive dirty tab before closing that tab", async () => {
    vi.mocked(openMarkdownDialog)
      .mockResolvedValueOnce("/tmp/first.md")
      .mockResolvedValueOnce("/tmp/second.md");
    vi.mocked(readMarkdownFile).mockImplementation(async (path) => ({
      path,
      contents: "# " + path,
      lossy: false
    }));

    render(<App />);

    fireEvent.click(await screen.findByTitle("Open Markdown File"));
    await screen.findByRole("tab", { name: "first.md" });
    fireEvent.click(screen.getByTitle("Open Markdown File"));
    await screen.findByRole("tab", { name: "second.md" });
    fireEvent.click(screen.getByRole("tab", { name: "first.md" }));
    fireEvent.change(await screen.findByPlaceholderText("Markdown source"), {
      target: { value: "# Edited first" }
    });
    await screen.findByRole("tab", { name: "first.md unsaved" });
    fireEvent.click(screen.getByRole("tab", { name: "second.md" }));
    fireEvent.click(screen.getByRole("button", { name: "Close first.md" }));

    const dialog = await screen.findByRole("dialog", { name: "Save changes?" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(writeMarkdownFile).toHaveBeenCalledWith("/tmp/first.md", "# Edited first");
    });
    expect(screen.queryByRole("tab", { name: "first.md" })).not.toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "second.md" })).toHaveAttribute("aria-selected", "true");
  });

  it("checks for updates from settings and reports the current version", async () => {
    vi.mocked(checkForUpdates).mockResolvedValue({
      status: "current",
      currentVersion: "1.2.4"
    });

    render(<App />);

    fireEvent.click(await screen.findByTitle("Settings and app info, mdview 1.2.4"));
    fireEvent.click(screen.getByRole("button", { name: "Check for updates" }));

    expect(checkForUpdates).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("Latest version already installed.")).toBeInTheDocument();
  });

  it("tears a saved tab into a new window when dragged away from the tab strip", async () => {
    vi.mocked(openMarkdownDialog).mockResolvedValue("/tmp/example.md");
    vi.mocked(readMarkdownFile).mockResolvedValue({
      path: "/tmp/example.md",
      contents: "# Example",
      lossy: false
    });

    render(<App />);

    fireEvent.click(await screen.findByTitle("Open Markdown File"));
    const tab = await screen.findByRole("tab", { name: "example.md" });

    fireEvent.dragStart(tab, { clientY: 100 });
    fireEvent.dragEnd(tab, { clientY: 20 });

    expect(openMarkdownWindow).toHaveBeenCalledWith("/tmp/example.md");
    expect(await screen.findByRole("tab", { name: "Untitled" })).toBeInTheDocument();
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

  it("saves every dirty tab before closing the native window", async () => {
    let closeHandler: ((event: { preventDefault: () => void }) => Promise<void>) | undefined;
    onCloseRequestedMock.mockImplementation((handler: typeof closeHandler) => {
      closeHandler = handler;
      return Promise.resolve(() => undefined);
    });
    vi.mocked(openMarkdownDialog).mockResolvedValueOnce("/tmp/first.md").mockResolvedValueOnce("/tmp/second.md");
    vi.mocked(readMarkdownFile).mockImplementation(async (path) => ({ path, contents: `# ${path}`, lossy: false }));
    vi.mocked(writeMarkdownFile).mockImplementation(async (path) => path);

    render(<App />);
    fireEvent.click(await screen.findByTitle("Open Markdown File"));
    fireEvent.change(await screen.findByPlaceholderText("Markdown source"), { target: { value: "# First edits" } });
    fireEvent.click(screen.getByTitle("Open Markdown File"));
    fireEvent.change(await screen.findByPlaceholderText("Markdown source"), { target: { value: "# Second edits" } });
    expect(await screen.findByRole("tab", { name: "second.md unsaved" })).toBeInTheDocument();

    const preventDefault = vi.fn();
    await closeHandler?.({ preventDefault });
    const dialog = await screen.findByRole("dialog", { name: "Save changes?" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() => expect(writeMarkdownFile).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(destroyMock).toHaveBeenCalledTimes(1));
    expect(writeMarkdownFile).toHaveBeenCalledWith("/tmp/first.md", "# First edits");
    expect(writeMarkdownFile).toHaveBeenCalledWith("/tmp/second.md", "# Second edits");
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
