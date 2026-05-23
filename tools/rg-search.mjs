import { spawn } from "node:child_process";

const input = await readInput();
const query = typeof input.query === "string" ? input.query : "";

if (!query) throw new Error("query is required");

const searchPath = safePath(input.path);
const output = await runRg([
  "--line-number",
  "--hidden",
  "--glob",
  "!node_modules",
  "--max-count",
  "20",
  query,
  ...(searchPath ? [searchPath] : ["."])
]);

writeText(limitLines(output, 120));

async function readInput() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  return raw ? JSON.parse(raw) : {};
}

function safePath(value) {
  if (typeof value !== "string" || value.startsWith("/") || value.includes("..")) return undefined;
  return value;
}

function runRg(args) {
  return new Promise((resolve, reject) => {
    const child = spawn("rg", args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", reject);
    child.on("close", (code) => {
      code === 0 || code === 1 ? resolve(stdout) : reject(new Error(stderr.trim() || "rg failed"));
    });
  });
}

function limitLines(text, lineLimit) {
  return text.split("\n").slice(0, lineLimit).join("\n");
}

function writeText(text) {
  process.stdout.write(JSON.stringify({ text: text || "(no matches)" }));
}
