import { beforeEach, describe, expect, it, vi } from "vitest";
import { checkForUpdates, compareVersions, isValidVersion } from "../../../src/lib/tauri";

const { checkMock, relaunchMock, getVersionMock } = vi.hoisted(() => ({
  checkMock: vi.fn(),
  relaunchMock: vi.fn(),
  getVersionMock: vi.fn(() => Promise.resolve("1.2.4"))
}));
vi.mock("@tauri-apps/api/app", () => ({ getVersion: getVersionMock }));
vi.mock("@tauri-apps/plugin-updater", () => ({ check: checkMock }));
vi.mock("@tauri-apps/plugin-process", () => ({ relaunch: relaunchMock }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/webviewWindow", () => ({ WebviewWindow: vi.fn() }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn(), save: vi.fn() }));

describe("updater version safety", () => {
  beforeEach(() => {
    checkMock.mockReset();
    relaunchMock.mockReset();
    getVersionMock.mockReset();
    getVersionMock.mockResolvedValue("1.2.4");
  });

  it("uses the native application version for update comparisons", async () => {
    checkMock.mockResolvedValue({ version: "1.2.4", downloadAndInstall: vi.fn() });
    await expect(checkForUpdates()).resolves.toEqual({ status: "current", currentVersion: "1.2.4" });
    expect(getVersionMock).toHaveBeenCalledOnce();
  });

  it("fails safely when the native application version is malformed", async () => {
    getVersionMock.mockResolvedValue("1.2");
    checkMock.mockResolvedValue(null);
    await expect(checkForUpdates()).rejects.toThrow(/installed application reports an invalid version/i);
  });

  it.each([["1.2.4", "1.2.4", 0], ["1.2.3", "1.2.4", -1], ["1.2.5", "1.2.4", 1]])(
    "compares %s against %s", (left, right, expected) => expect(compareVersions(left, right)).toBe(expected)
  );

  it("rejects malformed versions", () => {
    expect(isValidVersion("1.2")).toBe(false);
    expect(isValidVersion("1.2.4-01")).toBe(false);
    expect(isValidVersion("1.2.4+build.7")).toBe(true);
    expect(() => compareVersions("bad", "1.2.4")).toThrow(/invalid semantic versions/i);
    expect(compareVersions("1.2.4+build.1", "1.2.4+build.2")).toBe(0);
    expect(compareVersions("1.2.4-alpha.2", "1.2.4-alpha.10")).toBe(-1);
  });

  it.each([null, { version: "1.2.4", downloadAndInstall: vi.fn() }])("does not install equal remote versions", async (remote) => {
    checkMock.mockResolvedValue(remote);
    expect(await checkForUpdates()).toEqual({ status: "current", currentVersion: "1.2.4" });
    expect(relaunchMock).not.toHaveBeenCalled();
    if (remote) expect(remote.downloadAndInstall).not.toHaveBeenCalled();
  });

  it("does not install an older remote version", async () => {
    const downloadAndInstall = vi.fn();
    checkMock.mockResolvedValue({ version: "1.2.3", downloadAndInstall });
    expect(await checkForUpdates()).toEqual({ status: "current", currentVersion: "1.2.4" });
    expect(downloadAndInstall).not.toHaveBeenCalled();
  });

  it("installs and relaunches only for a newer version", async () => {
    const downloadAndInstall = vi.fn().mockResolvedValue(undefined);
    checkMock.mockResolvedValue({ version: "1.2.5", downloadAndInstall });
    expect(await checkForUpdates()).toEqual({ status: "installed", version: "1.2.5" });
    expect(downloadAndInstall).toHaveBeenCalledOnce();
    expect(relaunchMock).toHaveBeenCalledOnce();
  });

  it("fails safely for malformed metadata", async () => {
    checkMock.mockResolvedValue({ version: "not-semver", downloadAndInstall: vi.fn() });
    await expect(checkForUpdates()).rejects.toThrow(/invalid version/i);
    expect(relaunchMock).not.toHaveBeenCalled();
  });

  it("reports install failure and does not relaunch", async () => {
    const downloadAndInstall = vi.fn().mockRejectedValue(new Error("network unavailable"));
    checkMock.mockResolvedValue({ version: "1.2.5", downloadAndInstall });
    await expect(checkForUpdates()).rejects.toThrow("Could not install mdview 1.2.5: network unavailable");
    expect(relaunchMock).not.toHaveBeenCalled();
  });

  it("reports update-check failure without claiming the app is current", async () => {
    checkMock.mockRejectedValue(new Error("signature metadata unavailable"));
    await expect(checkForUpdates()).rejects.toThrow("Could not check for updates: signature metadata unavailable");
    expect(relaunchMock).not.toHaveBeenCalled();
  });

  it("reports relaunch failure after a successful install", async () => {
    const downloadAndInstall = vi.fn().mockResolvedValue(undefined);
    checkMock.mockResolvedValue({ version: "1.2.5", downloadAndInstall });
    relaunchMock.mockRejectedValue(new Error("restart denied"));
    await expect(checkForUpdates()).rejects.toThrow("Update 1.2.5 installed, but mdview could not restart: restart denied");
    expect(downloadAndInstall).toHaveBeenCalledOnce();
  });
});
