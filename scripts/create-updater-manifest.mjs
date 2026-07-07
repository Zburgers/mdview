#!/usr/bin/env node
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const args = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
  args.set(process.argv[index], process.argv[index + 1]);
}

const version = required("--version");
const repo = required("--repo");
const tag = required("--tag");
const assetsDir = required("--assets-dir");
const output = required("--output");

const files = await listFiles(assetsDir);
const platforms = {};

await addPlatform("linux-x86_64", (file) => file.endsWith(".AppImage"));
await addPlatform("windows-x86_64", (file) => file.endsWith(".exe"));

const macTargetFile = files.find((file) => path.basename(file) === "updater-target-macos.txt");
const macTarget = macTargetFile ? (await readFile(macTargetFile, "utf8")).trim() : "darwin-x86_64";
await addPlatform(macTarget, (file) => file.endsWith(".app.tar.gz"));

const manifest = {
  version,
  notes: `mdview ${tag}`,
  pub_date: new Date().toISOString(),
  platforms
};

await writeFile(output, `${JSON.stringify(manifest, null, 2)}\n`);

function required(name) {
  const value = args.get(name);
  if (!value) {
    throw new Error(`Missing ${name}`);
  }
  return value;
}

async function listFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(dir, entry.name);
      return entry.isDirectory() ? listFiles(entryPath) : [entryPath];
    })
  );
  return nested.flat();
}

async function addPlatform(target, predicate) {
  const asset = files.find((file) => predicate(file) && !file.endsWith(".sig"));
  if (!asset) {
    return;
  }

  const signaturePath = `${asset}.sig`;
  if (!files.includes(signaturePath)) {
    throw new Error(`Missing signature for ${asset}`);
  }

  const assetName = path.basename(asset);
  platforms[target] = {
    signature: (await readFile(signaturePath, "utf8")).trim(),
    url: `https://github.com/${repo}/releases/download/${tag}/${assetName}`
  };
}
