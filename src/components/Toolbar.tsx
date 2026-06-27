import {
  Columns2,
  Download,
  FileCode2,
  FilePlus2,
  FileText,
  FolderOpen,
  Moon,
  Printer,
  Save,
  Search,
  Sun,
  Trash2
} from "lucide-react";
import type { ThemePreference, ViewMode } from "../types";

type ToolbarProps = {
  fileName: string;
  dirty: boolean;
  mode: ViewMode;
  theme: ThemePreference;
  query: string;
  syncScroll: boolean;
  onNewFile: () => void;
  onOpen: () => void;
  onSave: () => void;
  onSaveAs: () => void;
  onPrint: () => void;
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

export function Toolbar(props: ToolbarProps) {
  return (
    <header className="toolbar">
      <div className="title-group">
        <div className="app-mark">mdview</div>
        <div className="file-title" title={props.fileName}>
          {props.fileName}
          {props.dirty ? " *" : ""}
        </div>
      </div>

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

      <div className="mode-control" aria-label="View mode">
        {modes.map(({ value, label, icon: Icon }) => (
          <button
            className={props.mode === value ? "active" : ""}
            key={value}
            onClick={() => props.onModeChange(value)}
            title={label}
          >
            <Icon size={16} />
            <span>{label}</span>
          </button>
        ))}
      </div>

      <label className="search-box">
        <Search size={16} />
        <input
          value={props.query}
          placeholder="Search"
          onChange={(event) => props.onQueryChange(event.currentTarget.value)}
        />
      </label>

      <label className="sync-toggle">
        <input
          type="checkbox"
          checked={props.syncScroll}
          onChange={(event) => props.onSyncScrollChange(event.currentTarget.checked)}
        />
        Sync
      </label>

      <select
        className="theme-select"
        value={props.theme}
        onChange={(event) => props.onThemeChange(event.currentTarget.value as ThemePreference)}
        title="Theme"
      >
        <option value="system">System</option>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </select>
      <span className="theme-icon" aria-hidden="true">
        {props.theme === "dark" ? <Moon size={16} /> : <Sun size={16} />}
      </span>
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
