import { listen } from "@tauri-apps/api/event";
import { useEffect, useMemo, useRef, useState } from "react";
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

export default function App() {
  const [documentState, setDocumentState] = useState<MarkdownDocument>(initialDocument);
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [searchQuery, setSearchQuery] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [systemDark, setSystemDark] = useState(false);
  const sourceRef = useRef<HTMLTextAreaElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);

  const actualTheme = settings.theme === "system" ? (systemDark ? "dark" : "light") : settings.theme;
  const hasDocument = documentState.isOpen;

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
    const unlistenPromise = listen<{ paths: string[] }>("tauri://drag-drop", (event) => {
      const candidate = event.payload.paths.find(isMarkdownLikePath);
      if (candidate) {
        void openPath(candidate);
      }
    });
    return () => {
      void unlistenPromise.then((unlisten) => unlisten());
    };
  }, []);

  const emptyState = useMemo(() => !hasDocument, [hasDocument]);

  useEffect(() => {
    if (settings.viewMode === "source" && hasDocument) {
      sourceRef.current?.focus();
    }
  }, [hasDocument, settings.viewMode]);

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
      setStatus(null);
    } catch (cause) {
      setStatus(cause instanceof Error ? cause.message : "Could not open file.");
    }
  }

  function handleNewFile() {
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

  async function handleOpen() {
    const selected = await openMarkdownDialog();
    if (selected) {
      await openPath(selected);
    }
  }

  async function handleSave() {
    if (documentState.path) {
      await writeMarkdownFile(documentState.path, documentState.markdown);
      setDocumentState((current) => ({ ...current, dirty: false }));
      setStatus("Saved.");
      return;
    }

    await handleSaveAs();
  }

  async function handleSaveAs() {
    const selected = await saveMarkdownDialog(documentState.path);
    if (!selected) {
      return;
    }

    await writeMarkdownFile(selected, documentState.markdown);
    setDocumentState((current) => ({
      ...current,
      path: selected,
      name: getMarkdownFileName(selected),
      dirty: false
    }));
    setStatus("Saved.");
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

  return (
    <main className="app-shell">
      <Toolbar
        fileName={documentState.name}
        dirty={documentState.dirty}
        mode={settings.viewMode}
        theme={settings.theme}
        query={searchQuery}
        syncScroll={settings.syncScroll}
        onNewFile={handleNewFile}
        onOpen={handleOpen}
        onSave={handleSave}
        onSaveAs={handleSaveAs}
        onPrint={() => window.print()}
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
          <div className="preview-scroll">
            <div className="empty-state">
              <h1>Open Markdown File</h1>
              <p>Drag and drop a Markdown file here.</p>
              <div className="empty-actions">
                <button onClick={handleOpen}>Open Markdown File</button>
                <button onClick={handleNewFile}>New Markdown File</button>
              </div>
              <RecentFiles
                files={settings.recentFiles}
                onOpen={openPath}
                onClear={() => updateSettings({ recentFiles: [] })}
              />
            </div>
          </div>
        ) : null}

        {!emptyState && (settings.viewMode === "split" || settings.viewMode === "source") && (
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
        )}

        {!emptyState && (settings.viewMode === "reader" || settings.viewMode === "split") && (
          <div className="preview-scroll" ref={previewRef}>
            <Preview
              markdown={documentState.markdown}
              filePath={documentState.path}
              theme={actualTheme}
              searchQuery={searchQuery}
            />
          </div>
        )}
      </section>
    </main>
  );
}
