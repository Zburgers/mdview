# Architecture Decision Records

This directory stores Architecture Decision Records (ADRs) for `mdview`.

Each ADR must live in its own directory and must include its own `assets/`
directory.

## Status Values

- `Proposed`: Drafted and waiting for explicit maintainer approval.
- `Accepted`: Approved and active.
- `Deprecated`: No longer recommended for new work.
- `Superseded`: Replaced by another ADR.
- `Rejected`: Considered but intentionally not adopted.

## Index

| ADR | Title | Status | Date |
| --- | --- | --- | --- |
| [0001](0001-release-and-push-adr-governance/adr.md) | Enforce ADR Governance for Push and Release Workflows | Proposed | 2026-04-10 |

## Required Workflow For Pushes And Releases

1. Draft or update an ADR in `docs/adr/` before any remote push or release.
2. Present the ADR to the maintainer and get explicit confirmation.
3. Keep commits atomic:
   - commit ADR changes separately
   - commit implementation changes separately
   - do not mix ADR + code changes in one commit
4. For manual releases, run `./release.sh` only after ADR confirmation and clean git state. A merged same-repository `X.Y.Z` release branch uses the guarded GitHub Actions release workflow.

## Creating A New ADR

1. Copy `docs/adr/template/` to `docs/adr/NNNN-title-with-dashes/`.
2. Keep both files in each ADR folder:
   - `adr.md`
   - `assets/` (for diagrams, screenshots, benchmark output)
3. Fill all required sections in `adr.md`.
4. Keep trade-offs honest and specific.
5. Update this index table.

## Automation

- `scripts/adr_guard.sh` enforces ADR presence and atomic ADR commits.
- `scripts/push.sh` runs ADR checks before `git push`.
- `release.sh` verifies release metadata and pushes the release tag for manual
  releases; `.github/workflows/release-on-merge.yml` performs the same handoff
  automatically for merged `X.Y.Z` release branches.

## Required Directory Layout

```text
docs/adr/
  README.md
  template/
    adr.md
    assets/
  0001-release-and-push-adr-governance/
    adr.md
    assets/
```
