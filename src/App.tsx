import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect, useMemo, useRef, useState } from "react";
import packageInfo from "../package.json";
import { WindowTitleBar } from "./components/layout/WindowTitleBar";
import { Preview } from "./components/Preview";
import { RecentFiles, Toolbar } from "./components/Toolbar";
import { defaultSettings } from "./lib/defaults";
import { getMarkdownFileName, isMarkdownLikePath, normalizeMarkdownText } from "./lib/markdown";
import {
  loadSettings,
  openMarkdownDialog,
  readMarkdownFile,
  saveMarkdownDialog,
  saveSettings,
  writeMarkdownFile
} from "./lib/tauri";
import type { AppSettings, MarkdownDocument, ThemePreference, ViewMode } from "./types";
import "./styles.css";

const initialDocument: MarkdownDocument = {
  isOpen: false,
  path: null,
  name: "Untitled",
  markdown: "",
  warning: null,
  dirty: false
};

type PendingAction = {
  label: string;
  run: () => Promise<void>;
};

export default function App() {
  const [documentState, setDocumentState] = useState<MarkdownDocument>(initialDocument);
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [searchQuery, setSearchQuery] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [systemDark, setSystemDark] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [pendingActionLabel, setPendingActionLabel] = useState<string | null>(null);
  const [isResolvingPendingAction, setIsResolvingPendingAction] = useState(false);
  const sourceRef = useRef<HTMLTextAreaElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const pendingActionRef = useRef<PendingAction | null>(null);
  const dirtyRef = useRef(documentState.dirty);

  const actualTheme = settings.theme === "system" ? (systemDark ? "dark" : "light") : settings.theme;
  const previewTheme = actualTheme === "light" || actualTheme === "paper" ? "light" : "dark";
  const hasDocument = documentState.isOpen;
  const searchMatchCount = useMemo(() => {
    const query = searchQuery.trim();
    if (!query) {
      return 0;
    }

    return (documentState.markdown.match(new RegExp(escapeRegExp(query), "gi")) ?? []).length;
  }, [documentState.markdown, searchQuery]);

  useEffect(() => {
    loadSettings()
      .then((loaded) => setSettings({ ...defaultSettings, ...loaded }))
      .catch(() => setSettings(defaultSettings));
  }, []);

  useEffect(() => {
    saveSettings(settings).catch(() => undefined);
  }, [settings]);

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
    dirtyRef.current = documentState.dirty;
  }, [documentState.dirty]);

  useEffect(() => {
    const unlistenPromise = listen<{ paths: string[] }>("tauri://drag-drop", (event) => {
      const candidate = event.payload.paths.find(isMarkdownLikePath);
      if (candidate) {
        void guardDocumentTransition(`open ${getMarkdownFileName(candidate)}`, () => openPath(candidate));
      }
    });
    return () => {
      void unlistenPromise.then((unlisten) => unlisten());
    };
  }, []);

  useEffect(() => {
    const unlistenPromise = listen<string>("cli-open-file", (event) => {
      const filePath = event.payload;
      if (filePath && isMarkdownLikePath(filePath)) {
        void openPath(filePath);
      }
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

  async function openPath(path: string) {
    if (!isMarkdownLikePath(path)) {
      setStatus("Only Markdown or text-like files can be opened.");
      return;
    }

    try {
      const response = await readMarkdownFile(path);
      const normalized = normalizeMarkdownText(response.contents);
      setDocumentState({
        isOpen: true,
        path: response.path,
        name: getMarkdownFileName(response.path),
        markdown: normalized.text,
        warning: response.lossy ? normalized.warning : null,
        dirty: false
      });
      setSettings((current) => ({
        ...current,
        recentFiles: [response.path, ...current.recentFiles.filter((file) => file !== response.path)].slice(
          0,
          10
        )
      }));
      setSearchQuery("");
      setStatus(null);
    } catch (cause) {
      setStatus(cause instanceof Error ? cause.message : "Could not open file.");
    }
  }

  function resetToNewFile() {
    setDocumentState({
      isOpen: true,
      path: null,
      name: "Untitled",
      markdown: "",
      warning: null,
      dirty: false
    });
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
      await guardDocumentTransition(`open ${getMarkdownFileName(selected)}`, async () => {
        await openPath(selected);
      });
    }
  }

  async function handleSave(): Promise<boolean> {
    try {
      if (documentState.path) {
        const savedPath = await writeMarkdownFile(documentState.path, documentState.markdown);
        setDocumentState((current) => ({
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
      setDocumentState((current) => ({
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

  return (
    <main className="app-shell">
      <WindowTitleBar fileName={documentState.name} dirty={documentState.dirty} />

      <Toolbar
        mode={settings.viewMode}
        theme={settings.theme}
        query={searchQuery}
        searchMatchCount={searchMatchCount}
        syncScroll={settings.syncScroll}
        appVersion={packageInfo.version}
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

      <div className="status-stack">
        {status ? <div className="status-bar">{status}</div> : null}
        {documentState.warning ? <div className="status-bar warning">{documentState.warning}</div> : null}
      </div>

      <section className={`workspace mode-${settings.viewMode}`} data-empty={emptyState}>
        {emptyState ? (
          <div className="preview-scroll empty-scroll">
            <div className="empty-state app-entrance">
              <p className="eyebrow">Local Markdown workspace</p>
              <h1>Open Markdown File</h1>
              <p>Drag and drop a Markdown file here.</p>
              <div className="empty-actions">
                <button onClick={handleOpen}>Open Markdown File</button>
                <button onClick={handleNewFile}>New Markdown File</button>
              </div>
              <RecentFiles
                files={settings.recentFiles}
                onOpen={(path) => {
                  void guardDocumentTransition(`open ${getMarkdownFileName(path)}`, () => openPath(path));
                }}
                onClear={() => updateSettings({ recentFiles: [] })}
              />
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
              onChange={(event) => {
                const markdown = event.currentTarget.value;
                setDocumentState((current) => ({
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
              <button className="icon-button" onClick={() => setSettingsOpen(false)} title="Close settings">
                x
              </button>
            </div>

            <section className="settings-section">
              <h3>Theme</h3>
              <div className="theme-grid">
                {(["system", "dark", "light", "paper", "midnight", "sage"] as const).map((theme) => (
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
                className={`setting-row ${settings.syncScroll ? "selected" : ""}`}
                onClick={() => updateSettings({ syncScroll: !settings.syncScroll })}
              >
                <span>Sync source and reader scroll</span>
                <strong>{settings.syncScroll ? "On" : "Off"}</strong>
              </button>
              <button className="setting-row" disabled title="Raw HTML remains sanitized in this release">
                <span>Trusted HTML rendering</span>
                <strong>Locked</strong>
              </button>
            </section>

            <section className="settings-section app-info">
              <h3>App</h3>
              <dl>
                <div>
                  <dt>Version</dt>
                  <dd>{packageInfo.version}</dd>
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
    sage: "Sage"
  };

  return labels[theme];
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
