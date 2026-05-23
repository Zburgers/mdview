import { spawn } from "node:child_process";

const input = await readInput();
const files = Array.isArray(input.files) ? input.files.filter(isSafeTestPath).slice(0, 6) : [];

if (files.length === 0) throw new Error("at least one targeted test file is required");

const output = await runNpm(["test", "--", ...files]);
writeText(limitLines(output, 160));

async function readInput() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  return raw ? JSON.parse(raw) : {};
}

function isSafeTestPath(value) {
  return typeof value === "string" && !value.startsWith("/") && !value.includes("..");
}

function runNpm(args) {
  return new Promise((resolve, reject) => {
    const child = spawn("npm", args, { stdio: ["ignore", "pipe", "pipe"] });
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
      code === 0 ? resolve(stdout) : reject(new Error(stderr.trim() || "targeted tests failed"));
    });
  });
}

function limitLines(text, lineLimit) {
  return text.split("\n").slice(0, lineLimit).join("\n");
}

function writeText(text) {
  process.stdout.write(JSON.stringify({ text: text || "(tests passed without output)" }));
}
