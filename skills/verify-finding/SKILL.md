---
name: verify-finding
description: Verify or reject Red Team findings with tool-forced evidence
---

# Verify Finding

## Purpose
Decide whether a Red Team lead is confirmed, rejected, or needs human review — based on actual file reads, not assumptions or grep alone.

## Steps

### 1. Verify every referenced file path exists
- Use `list-files` to confirm every file path in the finding exists.
- If a path does not exist → **REJECTED_FALSE_POSITIVE** immediately. No further analysis needed.

### 2. Read every cited file
- Use `read-file` on each file referenced in the finding.
- Read the specific lines or area cited.
- Compare the cited code pattern against what you actually read.

### 3. Check evidence integrity
- Does the finding claim a function name exists? Verify by reading the file.
- Does the finding claim a code pattern (`format!("{}", user_input)`, etc.)? Verify by reading the file.
- Does the finding reference a test file? Read the actual test file to verify.
- Does the finding claim a SQL injection risk? Check whether the app actually has a SQL database.

### 4. Record the verdict
Verdict options:
- **CONFIRMED**: The evidence matches. File path exists, code pattern is real, vulnerability is plausible.
- **REJECTED_FALSE_POSITIVE**: Path does not exist, function does not exist, code pattern does not match, or vulnerability is not actually exploitable in context.
- **NEEDS_HUMAN_REVIEW**: Evidence is ambiguous or requires domain expertise beyond available tools.
- **INSUFFICIENT_EVIDENCE**: Can neither confirm nor reject with available tools.

## Constraints
- Evidence requires actual file reads via `read-file`, not just grep results.
- If a referenced file does not exist → REJECTED_FALSE_POSITIVE. Simple.
- If a referenced function or pattern does not exist in the file → REJECTED_FALSE_POSITIVE.
- "Test suite already covers edge cases" is NOT valid evidence unless you READ the test file and verified the coverage.
- Use the most efficient tool sequence: `list-files` to confirm existence, then `read-file` on relevant files.
