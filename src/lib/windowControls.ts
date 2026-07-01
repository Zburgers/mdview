import { getCurrentWindow } from "@tauri-apps/api/window";

export async function minimizeWindow() {
  await getCurrentWindow().minimize();
}

export async function toggleMaximizeWindow() {
  await getCurrentWindow().toggleMaximize();
}

export async function startWindowDrag() {
  await getCurrentWindow().startDragging();
}

export async function requestWindowClose() {
  await getCurrentWindow().close();
}
