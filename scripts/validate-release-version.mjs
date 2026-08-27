#!/usr/bin/env node
import { readFile } from "node:fs/promises";

const tag = argument("--tag");
const latest = optionalArgument("--latest");
const packageJson = JSON.parse(await readFile("package.json", "utf8"));
const tauriConfig = JSON.parse(await readFile("src-tauri/tauri.conf.json", "utf8"));
const cargoToml = await readFile("src-tauri/Cargo.toml", "utf8");
const cargoVersion = /^version\s*=\s*"([^"]+)"/m.exec(cargoToml)?.[1];
const versions = {
  package: packageJson.version,
  cargo: cargoVersion,
  tauri: tauriConfig.version
};

for (const [source, version] of Object.entries(versions)) {
  if (!isSemver(version)) throw new Error(`${source} version is not valid semver: ${version ?? "missing"}`);
}
if (new Set(Object.values(versions)).size !== 1) {
  throw new Error(`Version mismatch: ${JSON.stringify(versions)}`);
}

if (tag) {
  if (!/^v\d+\.\d+\.\d+(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.test(tag)) {
    throw new Error(`Invalid release tag: ${tag}`);
  }
  if (tag.slice(1) !== packageJson.version) {
    throw new Error(`Release tag ${tag} does not match version ${packageJson.version}`);
  }
}

if (latest !== undefined) {
  const latestJson = JSON.parse(await readFile(latest, "utf8"));
  if (latestJson.version !== packageJson.version) {
    throw new Error(`Updater manifest version ${latestJson.version ?? "missing"} does not match ${packageJson.version}`);
  }
}

console.log(`Release version ${packageJson.version} is consistent across package.json, Cargo.toml, and tauri.conf.json.`);

function argument(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

function optionalArgument(name) {
  const value = argument(name);
  if (value === undefined && process.argv.includes(name)) throw new Error(`Missing ${name}`);
  return value;
}

function isSemver(value) {
  return typeof value === "string" && /^\d+\.\d+\.\d+(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.test(value);
}
