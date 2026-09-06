import { getCurrentWindow } from "@tauri-apps/api/window";

export type ResizeDirection =
  | "East" | "North" | "NorthEast" | "NorthWest"
  | "South" | "SouthEast" | "SouthWest" | "West";

export async function minimizeWindow() {
  await getCurrentWindow().minimize();
}

export async function toggleMaximizeWindow() {
  await getCurrentWindow().toggleMaximize();
}

export async function startWindowDrag() {
  await getCurrentWindow().startDragging();
}

export async function startWindowResize(direction: ResizeDirection) {
  const appWindow = getCurrentWindow();
  if (await appWindow.isMaximized() || await appWindow.isFullscreen()) {
    return;
  }
  await appWindow.startResizeDragging(direction);
}

export async function requestWindowClose() {
  await getCurrentWindow().close();
}
