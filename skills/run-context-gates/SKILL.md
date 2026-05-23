---
name: run-context-gates
description: Bound Graphify, diff, rg, test, and memory gates for ClawItUp audits.
---

# Run Context Gates

Use these gates to expand audit context only in bounded slices.

- Treat Graphify as context, not proof.
- Prefer `graphify-out/GRAPH_REPORT.md` when it exists.
- Refresh Graphify only with `graphify update .` and only when the command is available.
- Cap diff, `rg`, test, and memory output to the current scope budget.
- Record degraded mode when Graphify or verification is unavailable.
- Never expand to the whole repo by default.
