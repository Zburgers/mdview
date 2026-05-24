import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const input = await readInput();
const pattern = typeof input.pattern === "string" ? input.pattern : "";
const searchPath = safePath(input.path);

if (!pattern) throw new Error("pattern is required");

const baseDir = searchPath || ".";
const results = [];

walk(baseDir, "");

const matched = results
  .filter((f) => f.includes(pattern.replace(/\*/g, "").replace("?", "")))
  .sort();

writeText(matched.slice(0, 200).join("\n") || "(no matching files)");

function walk(root, relative) {
  let entries;
  try {
    entries = readdirSync(join(root, relative));
  } catch {
    return;
  }
  for (const entry of entries) {
    const relPath = relative ? `${relative}/${entry}` : entry;
    const fullPath = join(root, relPath);
    try {
      const stats = statSync(fullPath);
      if (stats.isDirectory()) {
        results.push(relPath + "/");
        walk(root, relPath);
      } else {
        results.push(relPath);
      }
    } catch {
      // skip unreadable
    }
  }
}

function safePath(value) {
  if (typeof value !== "string" || value.startsWith("/") || value.includes(".."))
    return undefined;
  return value;
}

async function readInput() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  return raw ? JSON.parse(raw) : {};
}

function writeText(text) {
  process.stdout.write(JSON.stringify({ text }));
}
