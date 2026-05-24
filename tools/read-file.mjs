import { readFileSync, statSync } from "node:fs";

const input = await readInput();
const filePath = typeof input.path === "string" ? input.path : "";

if (!filePath) throw new Error("path is required");
if (filePath.startsWith("/") || filePath.includes(".."))
  throw new Error("path must be repo-relative (no absolute or parent traversal)");

try {
  const stats = statSync(filePath);
  if (!stats.isFile()) throw new Error(`${filePath} is not a file`);
  if (stats.size > 1_048_576) throw new Error(`${filePath} is over 1MB — too large to read`);

  const content = readFileSync(filePath, "utf-8");
  const lines = content.split("\n");
  const truncated = lines.slice(0, 200);
  const info = `${filePath} (${lines.length} total lines, showing ${truncated.length})`;
  const output = `${info}\n${"-".repeat(40)}\n${truncated.join("\n")}`;

  writeText(output);
} catch (err) {
  if (err.code === "ENOENT") throw new Error(`File not found: ${filePath}`);
  throw err;
}

async function readInput() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  return raw ? JSON.parse(raw) : {};
}

function writeText(text) {
  process.stdout.write(JSON.stringify({ text: text || "(empty)" }));
}
