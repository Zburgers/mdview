import { invoke } from "@tauri-apps/api/core";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { open, save } from "@tauri-apps/plugin-dialog";
import { relaunch } from "@tauri-apps/plugin-process";
import { check } from "@tauri-apps/plugin-updater";
import packageInfo from "../../package.json";
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
  const currentVersion = packageInfo.version;

  if (!update) {
    return { status: "current", currentVersion };
  }

  if (!isValidVersion(update.version)) {
    throw new Error(`Update metadata contains an invalid version: ${update.version}`);
  }

  if (compareVersions(update.version, currentVersion) <= 0) {
    return { status: "current", currentVersion };
  }

  try {
    await update.downloadAndInstall();
  } catch (cause: unknown) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    throw new Error(`Could not install mdview ${update.version}: ${detail}`);
  }

  await relaunch();

  return { status: "installed", version: update.version };
}

type Semver = {
  major: number;
  minor: number;
  patch: number;
  prerelease: string[];
};

export function isValidVersion(version: string): boolean {
  return parseVersion(version) !== null;
}

export function compareVersions(left: string, right: string): number {
  const leftVersion = parseVersion(left);
  const rightVersion = parseVersion(right);
  if (!leftVersion || !rightVersion) {
    throw new Error("Cannot compare invalid semantic versions");
  }

  for (const key of ["major", "minor", "patch"] as const) {
    if (leftVersion[key] !== rightVersion[key]) {
      return leftVersion[key] > rightVersion[key] ? 1 : -1;
    }
  }

  if (leftVersion.prerelease.length === 0 && rightVersion.prerelease.length > 0) {
    return 1;
  }
  if (leftVersion.prerelease.length > 0 && rightVersion.prerelease.length === 0) {
    return -1;
  }

  for (let index = 0; index < Math.max(leftVersion.prerelease.length, rightVersion.prerelease.length); index += 1) {
    const leftPart = leftVersion.prerelease[index];
    const rightPart = rightVersion.prerelease[index];
    if (leftPart === undefined) return -1;
    if (rightPart === undefined) return 1;
    if (leftPart === rightPart) continue;
    const leftNumeric = /^\d+$/.test(leftPart);
    const rightNumeric = /^\d+$/.test(rightPart);
    if (leftNumeric && rightNumeric) return Number(leftPart) > Number(rightPart) ? 1 : -1;
    if (leftNumeric !== rightNumeric) return leftNumeric ? -1 : 1;
    return leftPart > rightPart ? 1 : -1;
  }
  return 0;
}

function parseVersion(version: string): Semver | null {
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/.exec(version);
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4]?.split(".") ?? []
  };
}
