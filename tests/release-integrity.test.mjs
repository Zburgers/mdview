import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { spawn } from "node:child_process";
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

test("release tag resolver accepts lightweight and annotated tags", async () => {
  const resolver = path.join(root, "scripts/resolve-release-tag.mjs");
  const lightweight = await runResolver(resolver, "abc123\trefs/tags/v1.2.5\n");
  assert.equal(lightweight.stdout.trim(), "abc123");

  const annotated = await runResolver(
    resolver,
    "tag456\trefs/tags/v1.2.5\ntag456\trefs/tags/v1.2.5^{}\n"
  );
  assert.equal(annotated.stdout.trim(), "tag456");

  await assert.rejects(runResolver(resolver, ""), /does not resolve to a commit/);
});

test("version bump updates every release source", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "mdview-version-"));
  await mkdir(path.join(temp, "src-tauri"));
  await writeFile(path.join(temp, "package.json"), '{"name":"mdview","version":"1.2.4"}\n');
  await writeFile(path.join(temp, "src-tauri/tauri.conf.json"), '{"version":"1.2.4"}\n');
  await writeFile(path.join(temp, "src-tauri/Cargo.toml"), '[package]\nversion = "1.2.4"\n');
  await writeFile(
    path.join(temp, "src-tauri/Cargo.lock"),
    '[[package]]\nname = "mdview"\nversion = "1.2.4"\n'
  );
  await writeFile(
    path.join(temp, "CHANGELOG.md"),
    "# Changelog\n\nAll notable changes to this project will be documented in this file.\n"
  );

  await exec(process.execPath, [
    "scripts/bump-version.mjs", "--version", "1.2.5", "--root", temp
  ], { cwd: root });

  assert.equal(JSON.parse(await readFile(path.join(temp, "package.json"), "utf8")).version, "1.2.5");
  assert.equal(JSON.parse(await readFile(path.join(temp, "src-tauri/tauri.conf.json"), "utf8")).version, "1.2.5");
  assert.match(await readFile(path.join(temp, "src-tauri/Cargo.toml"), "utf8"), /version = "1\.2\.5"/);
  assert.match(await readFile(path.join(temp, "src-tauri/Cargo.lock"), "utf8"), /name = "mdview"\nversion = "1\.2\.5"/);
  assert.match(await readFile(path.join(temp, "CHANGELOG.md"), "utf8"), /## \[1\.2\.5\]/);

  await assert.rejects(
    exec(process.execPath, ["scripts/bump-version.mjs", "--version", "1.2.4", "--root", temp], { cwd: root }),
    /Cannot release 1\.2\.4 over current version 1\.2\.5/
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
  assert.equal(
    manifest.platforms["linux-x86_64"].url,
    "https://github.com/Zburgers/mdview/releases/download/v1.2.4/mdview.AppImage"
  );

  await assert.rejects(
    exec(process.execPath, [
      "scripts/create-updater-manifest.mjs", "--version", "1.2.3", "--tag", "v1.2.4",
      "--repo", "Zburgers/mdview", "--assets-dir", path.join(temp, "assets"), "--output", path.join(temp, "bad.json")
    ], { cwd: root }),
    /does not match version/
  );
});

test("release workflow validates before bundling and publishes tags only", async () => {
  const workflow = await readFile(path.join(root, ".github/workflows/release-build.yml"), "utf8");
  assert.match(workflow, /node --test tests\/release-integrity\.test\.mjs/);
  assert.match(workflow, /bundle:\s*\n\s*name: Bundle[\s\S]*?needs: validate/);
  assert.match(workflow, /publish-release:[\s\S]*?if: startsWith\(github\.ref, 'refs\/tags\/v'\)/);
  assert.match(workflow, /Refuse to mutate a release from another commit/);
  assert.match(workflow, /refs\/tags\/\$\{GITHUB_REF_NAME\}" "refs\/tags\/\$\{GITHUB_REF_NAME\}\^\{\}" \| node scripts\/resolve-release-tag\.mjs/);
  assert.equal((workflow.match(/node scripts\/resolve-release-tag\.mjs/g) ?? []).length, 2);
  assert.match(workflow, /cancel-in-progress: \$\{\{ !startsWith\(github\.ref, 'refs\/tags\/v'\) \}\}/);
  assert.doesNotMatch(workflow, /publish_release/);
});

test("merged version branches prepare and dispatch a tagged release", async () => {
  const workflow = await readFile(path.join(root, ".github/workflows/release-on-merge.yml"), "utf8");
  assert.match(workflow, /types: \[closed\]/);
  assert.match(workflow, /github\.event\.pull_request\.merged == true/);
  assert.ok(workflow.includes('if [[ "${HEAD_REF}" =~ ^[0-9]+\\.[0-9]+\\.[0-9]+$ ]]'));
  assert.match(workflow, /node scripts\/bump-version\.mjs --version/);
  assert.match(workflow, /git push --atomic origin HEAD:main "\$\{TAG\}"/);
  assert.match(workflow, /gh workflow run release-build\.yml .*--ref "\$\{TAG\}"/);
  assert.match(workflow, /actions: write/);
});

function runResolver(resolver, input) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [resolver], { cwd: root });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      const error = new Error(stderr);
      Object.assign(error, { code, stdout, stderr });
      reject(error);
    });
    child.stdin.end(input);
  });
}
