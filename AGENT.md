# Agent Operating Rules

This file defines mandatory behavior for any agent working in this repository.

## Core Requirements

- Always treat push and release actions as governed workflows.
- Always use ADR workflow before remote integration.
- Always keep commits atomic and specific.
- Never combine ADR files and non-ADR files in the same commit.
- Never bypass `release.sh` for version releases.

## ADR Structure (Mandatory)

Every ADR must use its own directory:

```text
docs/adr/NNNN-title-with-dashes/
  adr.md
  assets/
```

Rules:

- `adr.md` is required.
- `assets/` is required even if empty.
- `docs/adr/README.md` index must be updated whenever a new ADR is added.

## Push Workflow (Mandatory)

When user intent includes "push", "push to remote", or equivalent:

1. Draft/update ADR in `docs/adr/<NNNN-slug>/adr.md`.
2. Show ADR draft to user and ask for explicit confirmation.
3. Commit ADR changes only.
4. Commit implementation changes separately.
5. Push using:

```bash
./scripts/push.sh
```

Do not use raw `git push` unless user explicitly asks to bypass wrappers.

## Release Workflow (Mandatory)

When user intent includes "release", "release new version", or equivalent:

1. Draft/update ADR for the release decision and changes.
2. Get explicit user confirmation on the ADR.
3. Create atomic commits (ADR commit separate from code changes).
4. Run release strictly through:

```bash
./release.sh
```

`release.sh` is the canonical release path and includes version bump/tag/release flow.

## Enforcement Scripts

- `scripts/adr_guard.sh --mode commit` checks atomic ADR commits.
- `scripts/adr_guard.sh --mode push` checks ADR updates before push.
- `scripts/adr_guard.sh --mode release` checks ADR updates before release.
- `scripts/push.sh` runs push guard then pushes.
- `release.sh` runs release guard before release operations.

## Commit Atomicity Policy

Accepted sequence:

1. `docs/adr/**` only commit
2. Code/docs implementation commit(s) outside ADR
3. Push/release step

Rejected sequence:

- single commit containing both `docs/adr/**` and source changes

## Agent Trigger Interpretation

Treat the following user phrases as workflow triggers:

- "push to remote"
- "push this"
- "release this"
- "release new version"
- "ship this"

On these triggers, agent must execute ADR draft -> confirmation -> atomic commits -> push/release.
