# mdview Agents

## Project shape

- `mdview` is a local-first Markdown viewer.
- The active app is a Tauri v2 desktop application:
  - frontend: React + Vite + TypeScript in `src/`
  - desktop/backend bridge: Rust commands in `src-tauri/`
- The old Python/GTK implementation is still in the repo as a reference, not the primary app path:
  - `markdown_editor.py`
  - `mdview_utils.py`
  - shell scripts in the repo root

## Primary entrypoints

- Frontend app shell: `src/App.tsx`
- Preview rendering and link handling: `src/components/Preview.tsx`
- Toolbar and recent files UI: `src/components/Toolbar.tsx`
- Markdown helpers: `src/lib/markdown.ts`
- Search highlighting: `src/lib/highlight.ts`
- Link classification: `src/lib/links.ts`
- Tauri bridge helpers: `src/lib/tauri.ts`
- Rust commands and settings persistence: `src-tauri/src/lib.rs`
- Tauri bootstrap: `src-tauri/src/main.rs`

## Working rules

- Treat the Tauri app as the product truth unless a task explicitly targets the legacy Python app.
- Preserve the local-first model:
  - native open/save dialogs
  - direct local file reads and writes through Tauri commands
  - settings persisted via the Tauri app config directory
- Keep security posture intact:
  - rendered Markdown stays sanitized by default
  - external links open only from explicit user action
  - Mermaid remains in strict mode
  - do not loosen Tauri CSP or broaden file handling without clear need
- Respect the existing allowed file types for desktop file I/O unless the task explicitly changes that behavior.
- Keep edits scoped to the app, packaging, and user-facing Markdown workflows.

## Validation path

Use the smallest relevant validation set first.

- frontend/unit checks:
  - `pnpm test`
  - `pnpm typecheck`
- active Vitest files live under `tests/frontend/`
- full frontend build:
  - `pnpm build`
- Rust/Tauri checks when desktop/backend code changes:
  - `cd src-tauri && cargo fmt --check`
  - `cd src-tauri && cargo check`
  - `cd src-tauri && cargo clippy -- -D warnings`

## Run paths

- Desktop app dev mode: `pnpm tauri dev`
- Frontend-only dev server: `pnpm dev`

Default to `pnpm tauri dev` when the user wants to test the real application, because it exercises both the Vite frontend and the Rust/Tauri layer.

## Agent expectations

- Read `README.md` before making product-level claims.
- Check `package.json` and `src-tauri/tauri.conf.json` before changing run/build instructions.
- If a task touches rendering or content safety, inspect both:
  - `src/lib/markdown.ts`
  - `src/components/Preview.tsx`
- If a task touches file access or settings persistence, inspect both:
  - `src/lib/tauri.ts`
  - `src-tauri/src/lib.rs`
