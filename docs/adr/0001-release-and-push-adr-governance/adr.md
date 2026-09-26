# ADR-0001: Enforce ADR Governance for Push and Release Workflows

## Status

Proposed

## Date

2026-04-10

## Deciders

- @naki

## Context

The project needs a consistent release process that all contributors and agents
follow. Recent workflows rely on convention, which risks inconsistent release
quality, unclear decision history, and mixed commits.

The maintainer requirement is to enforce ADR drafting and review before every
push to remote and every release. The process must also standardize release
execution through `./release.sh`.

## Decision Drivers

- Require explicit architectural rationale before remote integration.
- Keep commit history atomic and auditable.
- Ensure all releases use one consistent and tested mechanism.
- Ensure any agent in any chat follows the same process.

## Considered Options

### Option 1: Human-only process via documentation

- Pros: Simple, no scripts, low maintenance.
- Cons: Easy to bypass, inconsistent across contributors and agents.

### Option 2: Scripted guards + documented agent policy (proposed)

- Pros: Enforceable checks, repeatable behavior, clear failure messages.
- Cons: Adds process overhead and wrapper scripts.

### Option 3: CI-only enforcement

- Pros: Centralized control.
- Cons: Feedback comes late, local push/release flow remains inconsistent.

## Proposed Direction (Not Adopted)

If adopted, use **scripted local guards plus agent policy documentation**:

- Add an ADR guard for directory structure and commit atomicity.
- Add a push wrapper that runs the ADR guard before `git push`.
- Require manual releases through `./release.sh`, with installer building and
  publishing handled by GitHub Actions after the version tag is pushed. A merged
  same-repository `X.Y.Z` release branch may use the equivalent guarded automation
  in `.github/workflows/release-on-merge.yml`.
- Require per-ADR folder layout (`docs/adr/NNNN-slug/adr.md` + `assets/`).
- Require explicit maintainer confirmation through the merged release pull request
  or the manual release invocation before the version commit and tag are pushed.

The local ADR guard and push wrapper described above do not currently exist.

## Rationale

The proposal would balance enforcement and developer ergonomics. Local scripts
could give fast feedback before remote operations, alongside agent guidance.

## Consequences

### Positive

- Better traceability from architectural intent to release actions.
- Cleaner commit history through ADR/code commit separation.
- Consistent release procedure through the release workflow or `./release.sh`.

### Negative

- Extra workflow steps before push and release.
- Need to implement and maintain guard scripts as process evolves.

### Risks

- Overly strict checks may block legitimate edge workflows.
- Mitigation: keep failure messages actionable; tune rules as needed.

## Implementation Status

- `scripts/adr_guard.sh` and `scripts/push.sh` have not been implemented.
- `release.sh` validates release metadata before version tagging.
- Repository release guidance is maintained in `AGENTS.md` and the release docs.

## Related Decisions

- None yet.

## References

- `docs/adr/README.md`
- `release.sh`
- `AGENTS.md`
