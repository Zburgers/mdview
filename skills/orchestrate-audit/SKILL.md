---
name: orchestrate-audit
description: Orchestrate the report-first audit pipeline
---

# Orchestrate Audit

## Purpose
Drive the report-first audit pipeline from scope to ship report.

## Steps
1. Read the scope and keep it bounded.
2. Invoke Red Team to generate candidate findings.
3. Pass each candidate to verification before Blue Team sees it.
4. Produce a ship report with explicit policy outcome.

## Constraints
- Raw Red Team output is not a ship-blocking signal.
- Use repository evidence before asking for broader context.
