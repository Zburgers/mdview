# Test Index

This directory is the single home for repo test inventory.

## Layout

- `frontend/app/` - app shell, layout, and top-level workflow tests
- `frontend/components/` - component behavior tests
- `frontend/lib/` - frontend helper and utility tests
- `setup/` - shared Vitest environment/bootstrap files
- `legacy/python/` - archived legacy Python unittest coverage not run by `pnpm test`

## Runner Contract

- `pnpm test` runs the active Vitest suite from `tests/frontend/`
- `pnpm test:coverage` runs the active Vitest suite with coverage
- `pnpm typecheck` includes both `src/` and `tests/`
- legacy Python tests stay documented here, but are not part of the default Tauri app validation path

## Add New Tests

- add new active frontend tests under the matching `tests/frontend/` scope
- keep imports pointing back to `src/`
- update this file when adding a new test area or a new non-obvious suite
