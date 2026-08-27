import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import test from "node:test";
import assert from "node:assert/strict";

const exec = promisify(execFile);
const root = path.resolve(import.meta.dirname, "..");

test("release version gate accepts aligned sources and matching tag", async () => {
  const result = await exec(process.execPath, ["scripts/validate-release-version.mjs", "--tag", "v1.2.4"], { cwd: root });
  assert.match(result.stdout, /consistent/);
});

test("release version gate rejects a mismatched tag", async () => {
  await assert.rejects(
    exec(process.execPath, ["scripts/validate-release-version.mjs", "--tag", "v1.2.3"], { cwd: root }),
    /does not match version/
  );
});

test("updater manifest requires matching tag and signed assets", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "mdview-release-"));
  await mkdir(path.join(temp, "assets"));
  await writeFile(path.join(temp, "assets", "mdview.AppImage"), "bundle");
  await writeFile(path.join(temp, "assets", "mdview.AppImage.sig"), "signature\n");
  const output = path.join(temp, "latest.json");

  await exec(process.execPath, [
    "scripts/create-updater-manifest.mjs", "--version", "1.2.4", "--tag", "v1.2.4",
    "--repo", "Zburgers/mdview", "--assets-dir", path.join(temp, "assets"), "--output", output
  ], { cwd: root });
  const manifest = JSON.parse(await readFile(output, "utf8"));
  assert.equal(manifest.version, "1.2.4");
  assert.equal(manifest.platforms["linux-x86_64"].signature, "signature");

  await assert.rejects(
    exec(process.execPath, [
      "scripts/create-updater-manifest.mjs", "--version", "1.2.3", "--tag", "v1.2.4",
      "--repo", "Zburgers/mdview", "--assets-dir", path.join(temp, "assets"), "--output", path.join(temp, "bad.json")
    ], { cwd: root }),
    /does not match version/
  );
});
