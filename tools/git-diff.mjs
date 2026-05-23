import { spawn } from "node:child_process";

const input = await readInput();
const base = safeRevision(input.base);
const head = safeRevision(input.head);
const range = base && head ? `${base}...${head}` : undefined;
const output = await runGit([
  "diff",
  "--stat",
  "--unified=12",
  ...(range ? [range] : [])
]);

writeText(limitLines(output, 120));

async function readInput() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  return raw ? JSON.parse(raw) : {};
}

function safeRevision(value) {
  return typeof value === "string" && /^[A-Za-z0-9._/-]+$/.test(value) ? value : undefined;
}

function runGit(args) {
  return new Promise((resolve, reject) => {
    const child = spawn("git", args, { stdio: ["ignore", "pipe", "pipe"] });
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
      code === 0 ? resolve(stdout) : reject(new Error(stderr.trim() || "git diff failed"));
    });
  });
}

function limitLines(text, lineLimit) {
  return text.split("\n").slice(0, lineLimit).join("\n");
}

function writeText(text) {
  process.stdout.write(JSON.stringify({ text: text || "(no diff)" }));
}
