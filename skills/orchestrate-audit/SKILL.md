---
name: orchestrate-audit
description: Orchestrate the report-first audit pipeline with verified scope
---

# Orchestrate Audit

## Purpose
Drive the report-first audit pipeline from scope to ship report, establishing ground truth for all downstream agents so they cannot fabricate file paths.

## Steps

### 1. Validate and enumerate scope
- Use `list-files` to confirm every scoped directory exists.
- Produce a complete file inventory of the scoped area.
- If a scoped directory does not exist, note it explicitly — do NOT fabricate its contents.

### 2. Pass ground truth to Red Team
- Include the actual file listing and directory structure in the downstream context.
- This prevents Red Team from fabricating non-existent paths.

### 3. Invoke Red Team
- Pass the scope boundary and the verified file list.
- Do NOT pre-judge findings.

### 4. Route to verification
- Pass each candidate finding to the verifier BEFORE Blue Team sees it.
- Include the file inventory in the verification context.

### 5. Produce ship report
- Collect verified findings and remediation.
- State PASS, WARN, or FAIL with explicit evidence summary.

## Constraints
- Raw Red Team output is not a ship-blocking signal.
- Use repository evidence before asking for broader context.
- Ground truth (file inventory via `list-files`) MUST be established before findings are generated.
