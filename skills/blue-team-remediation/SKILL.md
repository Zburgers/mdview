---
name: blue-team-remediation
description: Turn CONFIRMED or NEEDS_HUMAN_REVIEW findings into remediation guidance
---

# Blue Team Remediation

## Purpose
Turn verified findings into concrete, minimal remediation guidance. Skip findings that were already rejected.

## Steps
1. Read only findings marked CONFIRMED or NEEDS_HUMAN_REVIEW.
2. REJECTED_FALSE_POSITIVE and INSUFFICIENT_EVIDENCE findings require no action — ignore them.
3. For each actionable finding:
   - Describe the smallest fix that eliminates the issue.
   - Reference the specific file and line numbers from the evidence.
   - Suggest regression checks (tests, lint rules, or tooling).
4. Group related findings into single remediation bundles.

## Constraints
- Do not expand scope beyond the confirmed issue.
- Stay report-first unless the user asks for patching.
- If zero actionable findings exist, output "No remediation required." in one sentence and stop — do not pad.
