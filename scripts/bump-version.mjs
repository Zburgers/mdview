#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const version = argument("--version");
const root = path.resolve(argument("--root") ?? ".");

if (!/^\d+\.\d+\.\d+$/.test(version ?? "")) {
  throw new Error(`Invalid version: ${version ?? "missing"}`);
}

const packagePath = path.join(root, "package.json");
const tauriPath = path.join(root, "src-tauri/tauri.conf.json");
const cargoPath = path.join(root, "src-tauri/Cargo.toml");
const lockPath = path.join(root, "src-tauri/Cargo.lock");
const changelogPath = path.join(root, "CHANGELOG.md");

const packageJson = JSON.parse(await readFile(packagePath, "utf8"));
if (compareVersions(version, packageJson.version) < 0) {
  throw new Error(`Cannot release ${version} over current version ${packageJson.version}`);
}
packageJson.version = version;
await writeFile(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`);

const tauriConfig = JSON.parse(await readFile(tauriPath, "utf8"));
tauriConfig.version = version;
await writeFile(tauriPath, `${JSON.stringify(tauriConfig, null, 2)}\n`);

const cargoToml = await readFile(cargoPath, "utf8");
const updatedCargoToml = cargoToml.replace(/^(version = ").*(")$/m, `$1${version}$2`);
if (updatedCargoToml === cargoToml) throw new Error("Could not find Cargo package version");
await writeFile(cargoPath, updatedCargoToml);

const cargoLock = await readFile(lockPath, "utf8");
const updatedCargoLock = cargoLock.replace(
  /(\[\[package\]\]\nname = "mdview"\nversion = ").*(")/,
  `$1${version}$2`
);
if (updatedCargoLock === cargoLock) throw new Error("Could not find mdview Cargo.lock package");
await writeFile(lockPath, updatedCargoLock);

const changelog = await readFile(changelogPath, "utf8");
const heading = `## [${version}]`;
if (!changelog.includes(heading)) {
  const marker = "All notable changes to this project will be documented in this file.";
  if (!changelog.includes(marker)) throw new Error("Could not find changelog insertion point");
  const entry = `${heading}\n\n_Automatically released from merged version branch \`${version}\`._\n\n`;
  await writeFile(changelogPath, changelog.replace(marker, `${marker}\n\n${entry}`));
}

console.log(`Prepared release version ${version}.`);

function argument(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

function compareVersions(left, right) {
  return left.split(".").map(Number).reduce((result, part, index) => result || part - Number(right.split(".")[index]), 0);
}
