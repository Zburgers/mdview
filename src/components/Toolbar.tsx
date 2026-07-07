import { type RefObject, useState, useEffect, useRef } from "react";
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
  Zap,
  ChevronDown
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
  searchInputRef?: RefObject<HTMLInputElement | null>;
};

const modes: Array<{ value: ViewMode; label: string; icon: typeof FileText }> = [
  { value: "reader", label: "Reader", icon: FileText },
  { value: "split", label: "Split", icon: Columns2 },
  { value: "source", label: "Source", icon: FileCode2 }
];

const themes: Array<{ value: ThemePreference; label: string }> = [
  { value: "system", label: "System" },
  { value: "light", label: "Quartz" },
  { value: "dark", label: "Graphite" },
  { value: "paper", label: "Paper" },
  { value: "midnight", label: "Midnight" },
  { value: "sage", label: "Sage" },
  { value: "nordic", label: "Nordic" },
  { value: "velvet", label: "Velvet" },
  { value: "crimson", label: "Crimson" }
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
            ref={props.searchInputRef}
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

        <ThemeDropdown theme={props.theme} onThemeChange={props.onThemeChange} />

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
        <h2>Recent Files</h2>
        <button className="icon-button" title="Clear recent files" onClick={onClear} style={{ width: 28, height: 28 }}>
          <Trash2 size={13} />
        </button>
      </div>
      <div className="recent-list">
        {files.map((file) => (
          <button key={file} onClick={() => onOpen(file)}>
            <div className="recent-item-icon" style={{ display: "flex", alignItems: "center", color: "var(--accent)" }}>
              <FileText size={16} />
            </div>
            <div className="recent-item-meta">
              <span>{file.split(/[\\/]/).pop()}</span>
              <small title={file}>{file}</small>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}

type ThemeDropdownProps = {
  theme: ThemePreference;
  onThemeChange: (theme: ThemePreference) => void;
};

export function ThemeDropdown({ theme, onThemeChange }: ThemeDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  const currentTheme = themes.find((t) => t.value === theme) || themes[0];

  return (
    <div className="custom-dropdown" ref={containerRef}>
      <button
        type="button"
        className="dropdown-trigger"
        onClick={() => setIsOpen(!isOpen)}
        title="Select Theme"
      >
        <span className={`theme-swatch theme-swatch-${theme}`} aria-hidden="true" />
        <span className="dropdown-label">{currentTheme.label}</span>
        <ChevronDown size={14} className={`chevron-icon ${isOpen ? "open" : ""}`} />
      </button>

      {isOpen && (
        <ul className="dropdown-menu">
          {themes.map((t) => (
            <li key={t.value}>
              <button
                type="button"
                className={`dropdown-item ${theme === t.value ? "selected" : ""}`}
                onClick={() => {
                  onThemeChange(t.value);
                  setIsOpen(false);
                }}
              >
                <span className={`theme-swatch theme-swatch-${t.value}`} aria-hidden="true" />
                <span>{t.label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

