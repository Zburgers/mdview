import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import type { AppSettings, ReadFileResponse } from "../types";

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
