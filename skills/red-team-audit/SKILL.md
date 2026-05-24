---
name: red-team-audit
description: Find plausible defects with mandatory tool-verified evidence
---

# Red Team Audit

## Purpose
Find plausible defects, vulnerabilities, regressions, and risky flows — backed by tool-verified evidence only. No evidence = no finding.

## Steps

### 1. Inventory scope
- Use `list-files` to enumerate ALL files in the scoped directories.
- Record the actual file listing. Do NOT reference any path not in this listing.

### 2. Search for patterns
- Use `rg-search` with targeted queries for vulnerability patterns.
- If `rg-search` returns no matches, the pattern does NOT exist. Do NOT fabricate results.

### 3. Read actual code
- Use `read-file` on any file you intend to cite.
- Read the specific function or block you are concerned about.
- Copy verbatim lines into your evidence.

### 4. Write findings
Every finding MUST include:
- `path`: A file path confirmed by `list-files` to exist
- `lines`: Actual line numbers from `read-file` output
- `code`: The verbatim code pattern you observed (not paraphrased)
- `why`: Why this matters (what could go wrong)

## Mandatory Verification Gate
Before finalizing ANY finding, you MUST pass this gate:
1. Did you call `list-files` to verify every referenced path exists? If not, stop.
2. Did you call `read-file` to read every file you cite? If not, stop.
3. Did your `rg-search` call actually return non-empty results? If not, the pattern does not exist — stop.

A finding that fails this gate will be automatically **REJECTED_FALSE_POSITIVE** by the filter. Fabricated findings waste tokens and reduce trust.

## Constraints
- Findings are provisional until verified.
- Do not claim CI failure from raw leads.
- **NEVER** fabricate file paths, function names, or code patterns.
- **NEVER** claim you ran a search or read a file without actually calling the tool.
- A finding with any fabricated element is invalid.
- If you cannot find real evidence, report "no findings" — that is a valid and expected outcome.
