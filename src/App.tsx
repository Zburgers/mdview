import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect, useMemo, useRef, useState } from "react";
import { Cpu, FileText, FolderOpen, Layers, Plus, Printer, RefreshCw, Sparkles, X } from "lucide-react";
import { WindowTitleBar } from "./components/layout/WindowTitleBar";
import { Preview } from "./components/Preview";
import { RecentFiles, Toolbar } from "./components/Toolbar";
import { defaultSettings } from "./lib/defaults";
import { getMarkdownFileName, isMarkdownLikePath, normalizeMarkdownText } from "./lib/markdown";
import {
  checkForUpdates,
  getNativeAppVersion,
  copyAttachment,
  loadSettings,
  openMarkdownWindow,
  openMarkdownDialog,
  readMarkdownFile,
  saveMarkdownDialog,
  saveSettings,
  startupOpenFile,
  writeMarkdownFile
} from "./lib/tauri";
import {
  classifyAttachment,
  markdownForAttachment,
  relativePosix,
  sanitizeAttachmentName
} from "./lib/attachments";
import type { AppSettings, MarkdownDocument, MarkdownTab, ReadFileResponse, ThemePreference, ViewMode } from "./types";
import "./styles.css";


const initialDocument: MarkdownDocument = {
  isOpen: false,
  path: null,
  name: "Untitled",
  markdown: "",
  warning: null,
  dirty: false
};

const createInitialTab = (id = "tab-1"): MarkdownTab => ({
  ...initialDocument,
  id
});

type PendingAction = {
  label: string;
  run: () => Promise<void>;
};

export default function App() {
  const [tabs, setTabs] = useState<MarkdownTab[]>(() => [createInitialTab()]);
  const [activeTabId, setActiveTabId] = useState("tab-1");
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [updateStatus, setUpdateStatus] = useState<string | null>(null);
  const [isCheckingUpdates, setIsCheckingUpdates] = useState(false);
  const [systemDark, setSystemDark] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [appVersion, setAppVersion] = useState<string | null>(null);
  const [pendingActionLabel, setPendingActionLabel] = useState<string | null>(null);
  const [isResolvingPendingAction, setIsResolvingPendingAction] = useState(false);
  const sourceRef = useRef<HTMLTextAreaElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const pendingActionRef = useRef<PendingAction | null>(null);
  const dirtyRef = useRef(false);
  const nextTabIdRef = useRef(2);
  const tabDragStartYRef = useRef<number | null>(null);

  const documentState = useMemo(
    () => tabs.find((tab) => tab.id === activeTabId) ?? tabs[0] ?? createInitialTab(),
    [activeTabId, tabs]
  );

  const actualTheme = settings.theme === "system" ? (systemDark ? "dark" : "light") : settings.theme;
  const previewTheme = actualTheme === "light" || actualTheme === "paper" ? "light" : "dark";
  const hasDocument = documentState.isOpen;
  const appVersionLabel = appVersion ? `v${appVersion}` : "Version unavailable";
  const searchMatchCount = useMemo(() => {
    const query = searchQuery.trim();
    if (!query) {
      return 0;
    }

    return (documentState.markdown.match(new RegExp(escapeRegExp(query), "gi")) ?? []).length;
  }, [documentState.markdown, searchQuery]);

  useEffect(() => {
    getNativeAppVersion()
      .then(setAppVersion)
      .catch(() => setAppVersion(null));
  }, []);

  useEffect(() => {
    loadSettings()
      .then((loaded) => setSettings({ ...defaultSettings, ...loaded }))
      .catch(() => setSettings(defaultSettings))
      .finally(() => setSettingsLoaded(true));
  }, []);

  useEffect(() => {
    if (!settingsLoaded) {
      return;
    }

    saveSettings(settings).catch(() => undefined);
  }, [settings, settingsLoaded]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => setSystemDark(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = actualTheme;
    document.title = `${documentState.dirty ? "* " : ""}${documentState.name} - mdview`;
  }, [actualTheme, documentState.dirty, documentState.name]);

  useEffect(() => {
    dirtyRef.current = tabs.some((tab) => tab.dirty);
  }, [tabs]);

  useEffect(() => {
    const unlistenPromise = listen<{ paths: string[] }>("tauri://drag-drop", (event) => {
      const candidate = event.payload.paths.find(isMarkdownLikePath);
      if (candidate && event.payload.paths.length === 1) {
        void openExternalPath(candidate);
        return;
      }
      // If multiple or non-markdown paths, treat as attachment drops if doc is open
      if (documentState.isOpen && event.payload.paths.length > 0) {
        void handleDroppedPaths(event.payload.paths);
        return;
      }
      if (candidate) void openExternalPath(candidate);
    });
    return () => {
      void unlistenPromise.then((unlisten) => unlisten());
    };
  }, [documentState.isOpen, documentState.path, documentState.markdown]);

  useEffect(() => {
    const unlistenPromise = listen<string>("cli-open-file", (event) => {
      const filePath = event.payload;
      if (filePath) {
        void openExternalPath(filePath);
      }
    });

    void unlistenPromise.then(() => {
      const queryFile = new URLSearchParams(window.location.search).get("file");
      if (queryFile) {
        void openExternalPath(queryFile);
        return;
      }

      void startupOpenFile()
        .then((filePath) => {
          if (filePath) {
            void openExternalPath(filePath);
          }
        })
        .catch(() => undefined);
    });

    return () => {
      void unlistenPromise.then((unlisten) => unlisten());
    };
  }, []);

  useEffect(() => {
    const appWindow = getCurrentWindow();
    const destroyWindow = async () => {
      try {
        await appWindow.destroy();
      } catch (cause) {
        setStatus(cause instanceof Error ? cause.message : "Could not close the window.");
      }
    };

    const unlistenPromise = appWindow.onCloseRequested(async (event) => {
      if (!dirtyRef.current) {
        return;
      }

      event.preventDefault();
      await queuePendingAction("close this window", async () => {
        await destroyWindow();
      });
    });

    return () => {
      void unlistenPromise.then((unlisten) => unlisten());
    };
  }, []);

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!documentState.dirty) {
        return;
      }

      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [documentState.dirty]);

  const emptyState = useMemo(() => !hasDocument, [hasDocument]);

  useEffect(() => {
    if (settings.viewMode === "source" && hasDocument) {
      sourceRef.current?.focus();
    }
  }, [hasDocument, settings.viewMode]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const mod = event.ctrlKey || event.metaKey;
      if (!mod) {
        return;
      }

      switch (event.key.toLowerCase()) {
        case "n":
          event.preventDefault();
          handleNewFile();
          break;
        case "o":
          event.preventDefault();
          void handleOpen();
          break;
        case "s":
          event.preventDefault();
          if (event.shiftKey) {
            void handleSaveAs();
          } else {
            void handleSave();
          }
          break;
        case "p":
          event.preventDefault();
          handlePrint();
          break;
        case "f":
          event.preventDefault();
          searchInputRef.current?.focus();
          break;
        case ",":
          event.preventDefault();
          setSettingsOpen(true);
          break;
        default:
          break;
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [documentState, settings]);

  function nextTabId() {
    const id = `tab-${nextTabIdRef.current}`;
    nextTabIdRef.current += 1;
    return id;
  }

  function updateActiveDocument(update: (current: MarkdownTab) => MarkdownTab) {
    setTabs((currentTabs) =>
      currentTabs.map((tab) => (tab.id === activeTabId ? update(tab) : tab))
    );
  }

  function isEmptyCleanStartupTab(tab: MarkdownTab) {
    return !tab.isOpen && !tab.dirty && tab.path === null && tab.markdown.length === 0;
  }

  function openDocumentInTab(response: ReadFileResponse) {
    const normalized = normalizeMarkdownText(response.contents);
    const nextDocument: Omit<MarkdownTab, "id"> = {
      isOpen: true,
      path: response.path,
      name: getMarkdownFileName(response.path),
      markdown: normalized.text,
      warning: response.lossy ? normalized.warning : null,
      dirty: false
    };

    setTabs((currentTabs) => {
      const existing = currentTabs.find((tab) => tab.path === response.path);
      if (existing) {
        setActiveTabId(existing.id);
        return currentTabs.map((tab) => (tab.id === existing.id ? { ...nextDocument, id: existing.id } : tab));
      }

      const activeTab = currentTabs.find((tab) => tab.id === activeTabId);
      if (activeTab && isEmptyCleanStartupTab(activeTab)) {
        return currentTabs.map((tab) => (tab.id === activeTabId ? { ...nextDocument, id: activeTabId } : tab));
      }

      const id = nextTabId();
      setActiveTabId(id);
      return [...currentTabs, { ...nextDocument, id }];
    });

    setSettings((current) => ({
      ...current,
      recentFiles: [response.path, ...current.recentFiles.filter((file) => file !== response.path)].slice(0, 10)
    }));
    setSearchQuery("");
    setStatus(null);
  }

  async function openPath(path: string) {
    if (!isMarkdownLikePath(path)) {
      setStatus("Only Markdown or text-like files can be opened.");
      return;
    }

    try {
      const response = await readMarkdownFile(path);
      openDocumentInTab(response);
    } catch (cause) {
      setStatus(cause instanceof Error ? cause.message : "Could not open file.");
    }
  }

  async function openExternalPath(path: string) {
    if (!isMarkdownLikePath(path)) {
      setStatus("Only Markdown or text-like files can be opened.");
      return;
    }

    await openPath(path);
  }

  function resetToNewFile() {
    const nextDocument: Omit<MarkdownTab, "id"> = {
      isOpen: true,
      path: null,
      name: "Untitled",
      markdown: "",
      warning: null,
      dirty: false
    };
    const activeTab = tabs.find((tab) => tab.id === activeTabId);
    if (activeTab && isEmptyCleanStartupTab(activeTab)) {
      updateActiveDocument((current) => ({ ...nextDocument, id: current.id }));
    } else {
      const id = nextTabId();
      setTabs((currentTabs) => [...currentTabs, { ...nextDocument, id }]);
      setActiveTabId(id);
    }
    setSearchQuery("");
    setStatus(null);
    updateSettings({ viewMode: "source" });
  }

  async function queuePendingAction(label: string, run: () => Promise<void>) {
    pendingActionRef.current = { label, run };
    setPendingActionLabel(label);
    setIsResolvingPendingAction(false);
  }

  function clearPendingAction() {
    pendingActionRef.current = null;
    setPendingActionLabel(null);
    setIsResolvingPendingAction(false);
  }

  async function guardDocumentTransition(label: string, run: () => Promise<void>) {
    if (!documentState.dirty) {
      await run();
      return;
    }

    await queuePendingAction(label, run);
  }

  async function runPendingAction() {
    const pending = pendingActionRef.current;
    if (!pending) {
      return;
    }

    clearPendingAction();
    await pending.run();
  }

  function handleNewFile() {
    void guardDocumentTransition("create a new file", async () => {
      resetToNewFile();
    });
  }

  async function handleOpen() {
    const selected = await openMarkdownDialog();
    if (selected) {
      await openPath(selected);
    }
  }

  async function handleSave(): Promise<boolean> {
    try {
      if (documentState.path) {
        const savedPath = await writeMarkdownFile(documentState.path, documentState.markdown);
        updateActiveDocument((current) => ({
          ...current,
          path: savedPath,
          name: getMarkdownFileName(savedPath),
          dirty: false
        }));
        setStatus("Saved.");
        return true;
      }

      return await handleSaveAs();
    } catch (cause) {
      setStatus(cause instanceof Error ? cause.message : "Could not save file.");
      return false;
    }
  }

  async function handleSaveAs(): Promise<boolean> {
    const selected = await saveMarkdownDialog(documentState.path);
    if (!selected) {
      setStatus("Save canceled.");
      return false;
    }

    try {
      const savedPath = await writeMarkdownFile(selected, documentState.markdown);
      updateActiveDocument((current) => ({
        ...current,
        path: savedPath,
        name: getMarkdownFileName(savedPath),
        dirty: false
      }));
      setSettings((prev) => ({
        ...prev,
        recentFiles: [savedPath, ...prev.recentFiles.filter((f) => f !== savedPath)].slice(0, 10)
      }));
      setStatus("Saved.");
      return true;
    } catch (cause) {
      setStatus(cause instanceof Error ? cause.message : "Could not save file.");
      return false;
    }
  }

  function handlePrint() {
    if (!hasDocument) {
      return;
    }

    const previousMode = settings.viewMode;
    if (previousMode === "source") {
      updateSettings({ viewMode: "reader" });
      requestAnimationFrame(() => {
        window.print();
        updateSettings({ viewMode: previousMode });
      });
    } else {
      window.print();
    }
  }

  function updateSettings(update: Partial<AppSettings>) {
    setSettings((current) => ({ ...current, ...update }));
  }

  async function handleToggleTask(line: number) {
    const lines = documentState.markdown.split("\n");
    if (line < 0 || line >= lines.length) return;
    const original = lines[line];
    const toggled = original.replace(
      /^(\s*[-*+]\s+)\[([ xX])\]/,
      (_m: string, prefix: string, mark: string) =>
        `${prefix}[${mark.trim().toLowerCase() === "x" ? " " : "x"}]`
    );
    if (toggled === original) return;
    lines[line] = toggled;
    const nextMarkdown = lines.join("\n");
    updateActiveDocument((current) => ({ ...current, markdown: nextMarkdown, dirty: true }));
    if (documentState.path) {
      try {
        await writeMarkdownFile(documentState.path, nextMarkdown);
        updateActiveDocument((current) => ({ ...current, dirty: false }));
      } catch (cause) {
        setStatus(cause instanceof Error ? cause.message : "Could not save checkbox state.");
      }
    }
  }

  function handleOpenWikilink(target: string, heading?: string) {
    if (!target) return;
    // Try to find in recentFiles by basename match
    const candidates = settings.recentFiles.filter((f) => {
      const base = f.split(/[\\/]/).pop()?.replace(/\.(md|markdown|mdown|mkd)$/i, "") ?? "";
      return base.toLowerCase() === target.toLowerCase() || f.toLowerCase().endsWith(`/${target.toLowerCase()}.md`);
    });
    if (candidates.length > 0) {
      void openPath(candidates[0]);
      return;
    }
    // Try relative to current file directory
    if (documentState.path) {
      const baseDir = documentState.path.split(/[\\/]/).slice(0, -1).join("/");
      const guesses = [
        `${baseDir}/${target}.md`,
        `${baseDir}/${target}`,
        `${target}.md`,
      ];
      for (const g of guesses) {
        // we optimistically try to open; if fails, status will show
        void openPath(g);
        return;
      }
    }
    setStatus(`Linked note not found: ${target}${heading ? `#${heading}` : ""}`);
  }

  function insertAtCursor(insertText: string) {
    const el = sourceRef.current;
    if (!el) {
      updateActiveDocument((current) => ({
        ...current,
        markdown: current.markdown ? `${current.markdown}\n${insertText}` : insertText,
        dirty: true
      }));
      return;
    }
    const start = el.selectionStart ?? documentState.markdown.length;
    const end = el.selectionEnd ?? start;
    const before = documentState.markdown.slice(0, start);
    const after = documentState.markdown.slice(end);
    const next = `${before}${insertText}${after}`;
    updateActiveDocument((current) => ({ ...current, markdown: next, dirty: true }));
    requestAnimationFrame(() => {
      const pos = start + insertText.length;
      el.focus();
      el.setSelectionRange(pos, pos);
    });
  }

  async function handleDroppedPaths(paths: string[]) {
    if (!documentState.isOpen) return;
    if (!documentState.path) {
      setStatus("Save the file first, then drop attachments.");
      return;
    }
    const baseDir = documentState.path.split(/[\\/]/).slice(0, -1).join("/");
    for (const dropped of paths) {
      // If markdown-like, open it rather than link
      if (isMarkdownLikePath(dropped)) {
        // if already open context is drag for link? prefer link when modifier? For now, insert link for drag from explorer
        // Check if it's within same dir: insert link instead of opening when dropped inside editor area
        // We distinguish by caller: this path handler is for content insertion, so treat markdown as link too
      }
      const fileName = dropped.split(/[\\/]/).pop() ?? dropped;
      const sanitized = sanitizeAttachmentName(fileName);
      const kind = classifyAttachment(sanitized);
      const dest = `${baseDir}/assets/${sanitized}`;
      const alreadyInside = dropped.replaceAll("\\", "/").startsWith(baseDir.replaceAll("\\", "/") + "/");
      try {
        let rel: string;
        if (alreadyInside) {
          rel = relativePosix(documentState.path, dropped);
        } else {
          const copied = await copyAttachment(dropped, dest);
          rel = relativePosix(documentState.path, copied);
        }
        insertAtCursor(markdownForAttachment(kind, rel, sanitized));
      } catch (cause) {
        setStatus(cause instanceof Error ? cause.message : `Could not attach ${sanitized}`);
      }
    }
  }

  async function handlePaste(event: React.ClipboardEvent<HTMLTextAreaElement>) {
    const files = Array.from(event.clipboardData.files);
    if (files.length === 0) return;
    // Only handle image files for paste; text handled normally
    const imageFiles = files.filter((f) => f.type.startsWith("image/"));
    if (imageFiles.length === 0) return;
    if (!documentState.isOpen) return;
    if (!documentState.path) {
      setStatus("Save the file first, then paste images.");
      event.preventDefault();
      return;
    }
    event.preventDefault();
    const baseDir = documentState.path.split(/[\\/]/).slice(0, -1).join("/");
    for (const file of imageFiles) {
      const sanitized = sanitizeAttachmentName(file.name || `pasted-${Date.now()}.png`);
      const dest = `${baseDir}/assets/${sanitized}`;
      try {
        // Use plugin-fs writeFile for blob, falling back to copy if needed
        // For clipboard Files, we write the blob bytes via Tauri fs plugin
        const { writeFile } = await import("@tauri-apps/plugin-fs");
        const buffer = new Uint8Array(await file.arrayBuffer());
        if (buffer.length > 20 * 1024 * 1024) {
          setStatus(`File too large (20 MB limit): ${sanitized}`);
          continue;
        }
        // Ensure collision handling similar to copyAttachment
        let finalDest = dest;
        // Try copyAttachment path first via writing temp then copy? Simpler: write directly
        // we mimic copyAttachment collision by checking existence
        const { exists } = await import("@tauri-apps/plugin-fs");
        if (await exists(finalDest)) {
          const dot = sanitized.lastIndexOf(".");
          const stem = dot >= 0 ? sanitized.slice(0, dot) : sanitized;
          const ext = dot >= 0 ? sanitized.slice(dot) : "";
          let idx = 1;
          while (await exists(`${baseDir}/assets/${stem} (${idx})${ext}`)) idx += 1;
          finalDest = `${baseDir}/assets/${stem} (${idx})${ext}`;
        }
        await writeFile(finalDest, buffer);
        const rel = relativePosix(documentState.path, finalDest);
        const kind = classifyAttachment(sanitized);
        insertAtCursor(markdownForAttachment(kind, rel, sanitized));
      } catch (cause) {
        setStatus(cause instanceof Error ? cause.message : `Could not paste ${sanitized}`);
      }
    }
  }

  function handleDragOver(event: React.DragEvent<HTMLTextAreaElement>) {
    if (event.dataTransfer.types.includes("Files")) {
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
    }
  }

  async function handleDrop(event: React.DragEvent<HTMLTextAreaElement>) {
    const files = Array.from(event.dataTransfer.files);
    if (files.length === 0) return;
    event.preventDefault();
    const paths: string[] = [];
    for (const f of files) {
      // Tauri may expose path via custom property; fallback to name
      const possiblePath = (f as unknown as { path?: string }).path;
      if (possiblePath) paths.push(possiblePath);
      else {
        // For web File without path, handle like paste: write blob
        if (!documentState.path) {
          setStatus("Save the file first, then drop files.");
          continue;
        }
        const baseDir = documentState.path.split(/[\\/]/).slice(0, -1).join("/");
        const sanitized = sanitizeAttachmentName(f.name || `dropped-${Date.now()}`);
        try {
          const { writeFile, exists } = await import("@tauri-apps/plugin-fs");
          const buffer = new Uint8Array(await f.arrayBuffer());
          if (buffer.length > 20 * 1024 * 1024) {
            setStatus(`File too large: ${sanitized}`);
            continue;
          }
          let finalDest = `${baseDir}/assets/${sanitized}`;
          if (await exists(finalDest)) {
            const dot = sanitized.lastIndexOf(".");
            const stem = dot >= 0 ? sanitized.slice(0, dot) : sanitized;
            const ext = dot >= 0 ? sanitized.slice(dot) : "";
            let idx = 1;
            while (await exists(`${baseDir}/assets/${stem} (${idx})${ext}`)) idx += 1;
            finalDest = `${baseDir}/assets/${stem} (${idx})${ext}`;
          }
          await writeFile(finalDest, buffer);
          const rel = relativePosix(documentState.path, finalDest);
          insertAtCursor(markdownForAttachment(classifyAttachment(sanitized), rel, sanitized));
        } catch (cause) {
          setStatus(cause instanceof Error ? cause.message : `Could not drop ${sanitized}`);
        }
      }
    }
    if (paths.length > 0) {
      await handleDroppedPaths(paths);
    }
  }

  function onSourceScroll() {
    if (!settings.syncScroll || settings.viewMode !== "split" || !sourceRef.current || !previewRef.current) {
      return;
    }
    const source = sourceRef.current;
    const preview = previewRef.current;
    const sourceMax = source.scrollHeight - source.clientHeight;
    const previewMax = preview.scrollHeight - preview.clientHeight;
    if (sourceMax <= 0 || previewMax <= 0) {
      return;
    }
    preview.scrollTop = (source.scrollTop / sourceMax) * previewMax;
  }

  async function handleSaveBeforeContinuing() {
    setIsResolvingPendingAction(true);
    const saved = await handleSave();
    if (saved) {
      await runPendingAction();
    } else {
      clearPendingAction();
    }
  }

  async function handleCheckForUpdates() {
    setIsCheckingUpdates(true);
    setUpdateStatus("Checking for updates...");

    try {
      const result = await checkForUpdates();
      if (result.status === "current") {
        setUpdateStatus("Latest version already installed.");
      } else {
        setUpdateStatus(`Update ${result.version} installed. Restarting mdview...`);
      }
    } catch (cause) {
      setUpdateStatus(cause instanceof Error ? cause.message : "Could not check for updates.");
    } finally {
      setIsCheckingUpdates(false);
    }
  }

  function closeTab(tabId: string) {
    setTabs((currentTabs) => {
      if (currentTabs.length === 1) {
        const replacement = createInitialTab(tabId);
        setActiveTabId(replacement.id);
        return [replacement];
      }

      const closingIndex = currentTabs.findIndex((tab) => tab.id === tabId);
      const nextTabs = currentTabs.filter((tab) => tab.id !== tabId);
      if (activeTabId === tabId) {
        const nextActive = nextTabs[Math.max(0, closingIndex - 1)] ?? nextTabs[0];
        setActiveTabId(nextActive.id);
      }
      return nextTabs;
    });
  }

  async function requestCloseTab(tab: MarkdownTab) {
    if (tab.dirty) {
      await queuePendingAction(`close ${tab.name}`, async () => closeTab(tab.id));
      return;
    }

    closeTab(tab.id);
  }

  async function detachTabToWindow(tab: MarkdownTab) {
    if (!tab.path || tab.dirty) {
      setStatus("Save this tab before dragging it into a new window.");
      return;
    }

    try {
      await openMarkdownWindow(tab.path);
      closeTab(tab.id);
    } catch (cause) {
      setStatus(cause instanceof Error ? cause.message : "Could not open a new window.");
    }
  }

  return (
    <main className="app-shell">
      <WindowTitleBar fileName={documentState.name} dirty={documentState.dirty} />

      <Toolbar
        mode={settings.viewMode}
        theme={settings.theme}
        query={searchQuery}
        searchMatchCount={searchMatchCount}
        syncScroll={settings.syncScroll}
        appVersion={appVersion ?? "Version unavailable"}
        onNewFile={handleNewFile}
        onOpen={handleOpen}
        onSave={handleSave}
        onSaveAs={handleSaveAs}
        onPrint={handlePrint}
        onOpenSettings={() => setSettingsOpen(true)}
        searchInputRef={searchInputRef}
        onModeChange={(viewMode: ViewMode) => updateSettings({ viewMode })}
        onThemeChange={(theme: ThemePreference) => updateSettings({ theme })}
        onQueryChange={setSearchQuery}
        onSyncScrollChange={(syncScroll) => updateSettings({ syncScroll })}
      />

      <div className="tab-strip" role="tablist" aria-label="Open Markdown files">
        {tabs.map((tab) => (
          <div className={tab.id === activeTabId ? "document-tab active" : "document-tab"} key={tab.id}>
            <button
              type="button"
              role="tab"
              draggable
              aria-selected={tab.id === activeTabId}
              aria-label={`${tab.name}${tab.dirty ? " unsaved" : ""}`}
              title={tab.path ?? tab.name}
              onDragStart={(event) => {
                tabDragStartYRef.current = event.clientY;
              }}
              onDragEnd={(event) => {
                const startY = tabDragStartYRef.current;
                tabDragStartYRef.current = null;
                if (startY === null || Math.abs(event.clientY - startY) < 48) {
                  return;
                }
                void detachTabToWindow(tab);
              }}
              onClick={() => {
                setActiveTabId(tab.id);
                setSearchQuery("");
              }}
            >
              <FileText size={14} />
              <span>{tab.name}</span>
              {tab.dirty ? <span aria-hidden="true" className="dirty-dot" /> : null}
            </button>
            <button
              type="button"
              className="tab-close"
              title={`Close ${tab.name}`}
              aria-label={`Close ${tab.name}`}
              onClick={() => void requestCloseTab(tab)}
            >
              <X size={13} />
            </button>
          </div>
        ))}
      </div>

      <div className="status-stack">
        {status ? <div className="status-bar">{status}</div> : null}
        {documentState.warning ? <div className="status-bar warning">{documentState.warning}</div> : null}
      </div>

      <section className={`workspace mode-${settings.viewMode}`} data-empty={emptyState}>
        {emptyState ? (
          <div className="preview-scroll empty-scroll">
            <div className="empty-state app-entrance">
              {/* Visually hidden elements for accessibility and tests */}
              <div className="sr-only">
                <h1>Open Markdown File</h1>
                <p>Drag and drop a Markdown file here.</p>
              </div>

              <div className="landing-hero">
                <div className="logo-glow">
                  <FileText size={40} className="hero-logo-icon" />
                  <Sparkles size={20} className="hero-logo-badge" />
                </div>
                <p className="eyebrow">Local Markdown companion • {appVersionLabel}</p>
                <div className="gradient-heading" style={{ fontSize: "clamp(2.4rem, 6vw, 3.8rem)", fontWeight: 850, letterSpacing: "-0.03em", margin: "12px 0 8px" }}>MDView</div>
                <p className="landing-subtitle">
                  A high-fidelity reader and editor for your local Markdown documents.
                </p>
              </div>


              <div className="landing-actions">
                <button className="action-card primary-card" onClick={handleOpen}>
                  <div className="action-card-icon">
                    <FolderOpen size={22} />
                  </div>
                  <div className="action-card-text">
                    <h3>Open Markdown</h3>
                    <p>Load an existing document from disk</p>
                  </div>
                </button>

                <button className="action-card secondary-card" onClick={handleNewFile}>
                  <div className="action-card-icon">
                    <Plus size={22} />
                  </div>
                  <div className="action-card-text">
                    <h3>Create Draft</h3>
                    <p>Start a new document scratchpad</p>
                  </div>
                </button>
              </div>

              <RecentFiles
                files={settings.recentFiles}
                onOpen={(path) => {
                  void guardDocumentTransition(`open ${getMarkdownFileName(path)}`, () => openPath(path));
                }}
                onClear={() => updateSettings({ recentFiles: [] })}
              />

              <div className="landing-features">
                <div className="feature-pill">
                  <Layers size={14} />
                  <span>Split Editor</span>
                </div>
                <div className="feature-pill">
                  <Cpu size={14} />
                  <span>Mermaid Diagrams</span>
                </div>
                <div className="feature-pill">
                  <Printer size={14} />
                  <span>Clean Printing</span>
                </div>
              </div>
            </div>
          </div>
        ) : null}


        {!emptyState && (settings.viewMode === "split" || settings.viewMode === "source") && (
          <div className="source-wrap">
            {!documentState.path && documentState.markdown.length === 0 ? (
              <div className="draft-callout">
                <p className="eyebrow">New file</p>
                <h2>Start with a heading, paste notes, or drop in a Mermaid sketch.</h2>
              </div>
            ) : null}
            <textarea
              ref={sourceRef}
              className="source-pane"
              value={documentState.markdown}
              placeholder="Markdown source"
              spellCheck={false}
              onScroll={onSourceScroll}
              onPaste={handlePaste}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              onChange={(event) => {
                const markdown = event.currentTarget.value;
                updateActiveDocument((current) => ({
                  ...current,
                  markdown,
                  dirty: true
                }));
              }}
            />
          </div>
        )}

        {!emptyState && (settings.viewMode === "reader" || settings.viewMode === "split") && (
          <div className="preview-scroll" ref={previewRef}>
            <Preview
              markdown={documentState.markdown}
              filePath={documentState.path}
              theme={previewTheme}
              searchQuery={searchQuery}
              allowRemoteImages={settings.allowRemoteImages}
              onToggleTask={handleToggleTask}
              onOpenWikilink={handleOpenWikilink}
            />
          </div>
        )}
      </section>

      {settingsOpen ? (
        <div className="settings-backdrop" role="presentation" onMouseDown={() => setSettingsOpen(false)}>
          <aside
            className="settings-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="settings-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="settings-header">
              <div>
                <p className="eyebrow">Preferences</p>
                <h2 id="settings-title">Settings</h2>
              </div>
              <button className="icon-button" onClick={() => setSettingsOpen(false)} title="Close settings" style={{ border: "0", background: "transparent" }}>
                <X size={18} />
              </button>
            </div>

            <div className="settings-content">
              <section className="settings-section">
                <h3>Theme</h3>
                <div className="theme-grid">
                {(["system", "light", "dark", "paper", "midnight", "sage", "nordic", "velvet", "crimson"] as const).map((theme) => (
                  <button
                    key={theme}
                    className={settings.theme === theme ? "selected" : ""}
                    onClick={() => updateSettings({ theme })}
                  >
                    <span className={`theme-swatch theme-swatch-${theme}`} />
                    <span>{themeLabel(theme)}</span>
                  </button>
                ))}
                </div>
              </section>

              <section className="settings-section">
              <h3>Editor</h3>
              <button
                className="setting-row-toggle"
                onClick={() => updateSettings({ syncScroll: !settings.syncScroll })}
              >
                <div className="toggle-info">
                  <span className="toggle-label">Sync Scroll</span>
                  <span className="toggle-sub">Align source and reader panes</span>
                </div>
                <div className={`switch-control ${settings.syncScroll ? "active" : ""}`}>
                  <span className="switch-thumb" />
                </div>
              </button>

              <button
                className="setting-row-toggle"
                disabled
                title="Raw HTML remains sanitized in this release"
                style={{ opacity: 0.65, cursor: "not-allowed" }}
              >
                <div className="toggle-info">
                  <span className="toggle-label">Trusted HTML</span>
                  <span className="toggle-sub">Enable unsanitized HTML rendering</span>
                </div>
                <div className="switch-control">
                  <span className="switch-thumb" />
                </div>
              </button>

              <button
                className="setting-row-toggle"
                aria-pressed={settings.allowRemoteImages}
                onClick={() => updateSettings({ allowRemoteImages: !settings.allowRemoteImages })}
              >
                <div className="toggle-info">
                  <span className="toggle-label">Remote Images</span>
                  <span className="toggle-sub">Load external images embedded in Markdown</span>
                </div>
                <div className={`switch-control ${settings.allowRemoteImages ? "active" : ""}`}>
                  <span className="switch-thumb" />
                </div>
              </button>
              </section>

              <section className="settings-section app-info">
              <h3>App Info</h3>
              <dl>
                <div>
                  <dt>Version</dt>
                  <dd>{appVersionLabel}</dd>
                </div>
                <div>
                  <dt>Renderer</dt>
                  <dd>React + Tauri</dd>
                </div>
                <div>
                  <dt>Mermaid</dt>
                  <dd>Strict mode</dd>
                </div>
              </dl>
              </section>

              <section className="settings-section">
              <h3>Updates</h3>
              <button
                className="setting-row-toggle"
                aria-label="Check for updates"
                disabled={isCheckingUpdates}
                onClick={() => void handleCheckForUpdates()}
              >
                <div className="toggle-info">
                  <span className="toggle-label">Check for updates</span>
                  <span className="toggle-sub">Install the latest signed GitHub release</span>
                </div>
                <RefreshCw size={18} />
              </button>
              {updateStatus ? <p className="settings-note">{updateStatus}</p> : null}
              </section>
            </div>
          </aside>
        </div>
      ) : null}

      {pendingActionLabel ? (
        <div className="modal-backdrop" role="presentation">
          <div
            className="confirm-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="unsaved-changes-title"
            aria-describedby="unsaved-changes-description"
          >
            <h2 id="unsaved-changes-title">Save changes?</h2>
            <p id="unsaved-changes-description">
              Your current file has unsaved changes. Save them before you {pendingActionLabel}?
            </p>
            <div className="confirm-actions">
              <button onClick={clearPendingAction}>Cancel</button>
              <button onClick={() => void runPendingAction()}>Don&apos;t Save</button>
              <button className="primary" disabled={isResolvingPendingAction} onClick={() => void handleSaveBeforeContinuing()}>
                {isResolvingPendingAction ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

function themeLabel(theme: ThemePreference) {
  const labels: Record<ThemePreference, string> = {
    system: "System",
    light: "Quartz",
    dark: "Graphite",
    paper: "Paper",
    midnight: "Midnight",
    sage: "Sage",
    nordic: "Nordic",
    velvet: "Velvet",
    crimson: "Crimson"
  };

  return labels[theme];
}


function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
