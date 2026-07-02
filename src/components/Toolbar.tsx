import {
  Columns2,
  Download,
  FileCode2,
  FilePlus2,
  FileText,
  FolderOpen,
  Printer,
  Save,
  Search,
  Settings2,
  Sparkles,
  Trash2,
  Zap
} from "lucide-react";
import type { ThemePreference, ViewMode } from "../types";

type ToolbarProps = {
  mode: ViewMode;
  theme: ThemePreference;
  query: string;
  searchMatchCount: number;
  syncScroll: boolean;
  appVersion: string;
  onNewFile: () => void;
  onOpen: () => void;
  onSave: () => void;
  onSaveAs: () => void;
  onPrint: () => void;
  onOpenSettings: () => void;
  onModeChange: (mode: ViewMode) => void;
  onThemeChange: (theme: ThemePreference) => void;
  onQueryChange: (query: string) => void;
  onSyncScrollChange: (enabled: boolean) => void;
};

const modes: Array<{ value: ViewMode; label: string; icon: typeof FileText }> = [
  { value: "reader", label: "Reader", icon: FileText },
  { value: "split", label: "Split", icon: Columns2 },
  { value: "source", label: "Source", icon: FileCode2 }
];

const themes: Array<{ value: ThemePreference; label: string }> = [
  { value: "system", label: "System" },
  { value: "dark", label: "Graphite" },
  { value: "light", label: "Quartz" },
  { value: "paper", label: "Paper" },
  { value: "midnight", label: "Midnight" },
  { value: "sage", label: "Sage" }
];

export function Toolbar(props: ToolbarProps) {
  return (
    <header className="toolbar">
      <div className="toolbar-actions">
        <button className="icon-button" title="New Markdown File" onClick={props.onNewFile}>
          <FilePlus2 size={18} />
        </button>
        <button className="icon-button" title="Open Markdown File" onClick={props.onOpen}>
          <FolderOpen size={18} />
        </button>
        <button className="icon-button" title="Save" onClick={props.onSave}>
          <Save size={18} />
        </button>
        <button className="icon-button" title="Save As" onClick={props.onSaveAs}>
          <Download size={18} />
        </button>
        <button className="icon-button" title="Print or Export PDF" onClick={props.onPrint}>
          <Printer size={18} />
        </button>
      </div>

      <div className="toolbar-center">
        <div className="mode-control" aria-label="View mode">
          <span className={`mode-indicator mode-${props.mode}`} aria-hidden="true" />
          {modes.map(({ value, label, icon: Icon }) => (
            <button
              className={props.mode === value ? "active" : ""}
              key={value}
              onClick={() => props.onModeChange(value)}
              title={label}
            >
              <Icon size={15} />
              <span>{label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="toolbar-right">
        <label className="search-box">
          <Search size={16} />
          <input
            value={props.query}
            placeholder="Search document"
            onChange={(event) => props.onQueryChange(event.currentTarget.value)}
          />
          {props.query ? <span>{props.searchMatchCount}</span> : null}
        </label>

        <button
          className={`sync-toggle ${props.syncScroll ? "active" : ""}`}
          type="button"
          aria-pressed={props.syncScroll}
          title="Sync source and reader scrolling"
          onClick={() => props.onSyncScrollChange(!props.syncScroll)}
        >
          <Zap size={15} />
          <span>Sync</span>
        </button>

        <div className="theme-menu">
          <Sparkles size={15} aria-hidden="true" />
          <select
            value={props.theme}
            onChange={(event) => props.onThemeChange(event.currentTarget.value as ThemePreference)}
            title="Theme"
          >
            {themes.map((theme) => (
              <option key={theme.value} value={theme.value}>
                {theme.label}
              </option>
            ))}
          </select>
        </div>

        <button className="icon-button" title={`Settings and app info, mdview ${props.appVersion}`} onClick={props.onOpenSettings}>
          <Settings2 size={18} />
        </button>
      </div>
    </header>
  );
}

type RecentFilesProps = {
  files: string[];
  onOpen: (path: string) => void;
  onClear: () => void;
};

export function RecentFiles({ files, onOpen, onClear }: RecentFilesProps) {
  if (files.length === 0) {
    return null;
  }

  return (
    <section className="recent-files">
      <div className="recent-header">
        <h2>Recent files</h2>
        <button className="icon-button" title="Clear recent files" onClick={onClear}>
          <Trash2 size={16} />
        </button>
      </div>
      <div className="recent-list">
        {files.map((file) => (
          <button key={file} onClick={() => onOpen(file)}>
            <span>{file.split(/[\\/]/).pop()}</span>
            <small>{file}</small>
          </button>
        ))}
      </div>
    </section>
  );
}
