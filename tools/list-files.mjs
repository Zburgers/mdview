import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const EXCLUDE_DIRS = new Set(["node_modules", ".git", "target", "__pycache__", "dist", ".ruff_cache"]);

const input = await readInput();
const pattern = typeof input.pattern === "string" ? input.pattern : "";
const rawPath = typeof input.path === "string" ? input.path : null;

if (!pattern) throw new Error("pattern is required");

const results = [];

walk(".");

const filterPrefix = pattern.replace(/\*\*/g, "").replace(/\*/g, "").replace(/^\//, "");

const matched = results
  .filter((f) => !EXCLUDE_DIRS.has(f.split("/")[0]))
  .filter((f) => {
    if (pattern === "*") return true;
    if (f === pattern) return true;
    if (f.includes(filterPrefix)) return true;
    if (f.endsWith(pattern)) return true;
    return false;
  })
  .filter((f) => {
    if (!rawPath) return true;
    const prefix = rawPath.endsWith("/") ? rawPath : rawPath + "/";
    return f.startsWith(prefix);
  })
  .sort();

writeText(matched.length > 0 ? matched.slice(0, 200).join("\n") : "(no matching files)");

function walk(relative) {
  let entries;
  try {
    entries = readdirSync(join(".", relative));
  } catch {
    return;
  }
  for (const entry of entries) {
    const relPath = relative === "." ? entry : `${relative}/${entry}`;
    try {
      const stats = statSync(join(".", relPath));
      if (stats.isDirectory()) {
        if (EXCLUDE_DIRS.has(entry)) continue;
        walk(relPath);
      } else {
        results.push(relPath);
      }
    } catch {
      // skip unreadable
    }
  }
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
