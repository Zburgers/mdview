import { access, readFile } from "node:fs/promises";
import { spawn } from "node:child_process";

const args = await readInput();
const reportPath = "graphify-out/GRAPH_REPORT.md";

if (args.refresh === true) {
  await run("graphify", ["update", "."]);
}

try {
  await access(reportPath);
  const report = await readFile(reportPath, "utf8");
  const excerpt = report.split("\n").slice(0, 80).join("\n");

  writeText(`Graphify context only, not proof.\n\n${excerpt}`);
} catch {
  writeText(`Graphify degraded: ${reportPath} is unavailable. Run graphify update . when available.`);
}

async function readInput() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  return raw ? JSON.parse(raw) : {};
}

function run(command, commandArgs) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, commandArgs, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", reject);
    child.on("close", (code) => {
      code === 0 ? resolve() : reject(new Error(stderr.trim() || `${command} failed`));
    });
  });
}

function writeText(text) {
  process.stdout.write(JSON.stringify({ text }));
}
