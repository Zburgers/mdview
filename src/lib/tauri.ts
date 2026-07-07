import { invoke } from "@tauri-apps/api/core";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { open, save } from "@tauri-apps/plugin-dialog";
import { relaunch } from "@tauri-apps/plugin-process";
import { check } from "@tauri-apps/plugin-updater";
import type { AppSettings, ReadFileResponse, UpdateCheckResult } from "../types";

const markdownFilters = [
  {
    name: "Markdown",
    extensions: ["md", "markdown", "mdown", "mkd", "txt", "text"]
  }
];

export async function openMarkdownDialog(): Promise<string | null> {
  const selected = await open({
    multiple: false,
    directory: false,
    filters: markdownFilters
  });

  return typeof selected === "string" ? selected : null;
}

export async function saveMarkdownDialog(defaultPath?: string | null): Promise<string | null> {
  const selected = await save({
    defaultPath: defaultPath ?? undefined,
    filters: markdownFilters
  });

  return typeof selected === "string" ? selected : null;
}

export function readMarkdownFile(path: string): Promise<ReadFileResponse> {
  return invoke("read_markdown_file", { path });
}

export function writeMarkdownFile(path: string, contents: string): Promise<string> {
  return invoke("write_markdown_file", { path, contents });
}

export function loadSettings(): Promise<AppSettings> {
  return invoke("load_settings");
}

export function saveSettings(settings: AppSettings): Promise<void> {
  return invoke("save_settings", { settings });
}

export function startupOpenFile(): Promise<string | null> {
  return invoke("startup_open_file");
}

export function openMarkdownWindow(path: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const label = `mdview-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const window = new WebviewWindow(label, {
      url: `/?file=${encodeURIComponent(path)}`,
      title: "mdview",
      width: 1180,
      height: 760,
      minWidth: 720,
      minHeight: 520,
      dragDropEnabled: true,
      decorations: false
    });

    void window.once("tauri://created", () => resolve());
    void window.once("tauri://error", (event) => reject(event.payload));
  });
}

export async function checkForUpdates(): Promise<UpdateCheckResult> {
  const update = await check();

  if (!update) {
    return { status: "current" };
  }

  await update.downloadAndInstall();
  await relaunch();

  return { status: "installed", version: update.version };
}
