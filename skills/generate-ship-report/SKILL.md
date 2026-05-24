---
name: generate-ship-report
description: Summarize the audit outcome as a policy-backed ship report
---

# Generate Ship Report

## Purpose
Summarize the audit outcome in a clear, policy-backed ship report with minimal token waste.

## Steps
1. Collect all verified findings with their verdicts.
2. Classify the outcome:
   - **PASS**: No CONFIRMED findings. Zero blocking issues.
   - **WARN**: At least one NEEDS_HUMAN_REVIEW finding. Ship with caveats.
   - **FAIL**: At least one CONFIRMED finding. Do not ship without remediation.
3. Write the report:
   - One-line verdict (PASS/WARN/FAIL).
   - Brief count of findings by verdict category.
   - Next action for the user (one sentence).
4. Minimize token usage — a one-line PASS is fine.

## Constraints
- The report should be readable without hidden state.
- Keep the ship decision explicit.
- Do not pad with boilerplate. If the verdict is PASS and there are zero findings, output "PASS: No findings detected." and stop.
