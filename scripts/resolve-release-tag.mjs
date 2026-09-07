#!/usr/bin/env node
let input = "";
for await (const chunk of process.stdin) input += chunk;
let direct;
let peeled;

for (const line of input.split("\n")) {
  const [sha, ref] = line.trim().split(/\s+/);
  if (!sha || !ref) continue;
  if (ref.endsWith("^{}")) peeled = sha;
  else direct = sha;
}

const resolved = peeled ?? direct;
if (!resolved) {
  throw new Error("Release tag does not resolve to a commit");
}

process.stdout.write(`${resolved}\n`);
