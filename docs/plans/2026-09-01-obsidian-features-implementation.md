# Obsidian-Style Features: 1.2.5 Implementation Record

**Status:** Implemented on branch `1.2.5`; design approval remains pending (see the linked design).

This record replaces the completed task-by-task plan. The original [design](2026-09-01-obsidian-features-design.md) and [research](../research/2026-09-01-obsidian-rendering-research.md) retain the rationale and trade-offs.

## Decisions retained

- Keep the existing textarea editor and isolated `Marked` → `DOMPurify` → strict Mermaid rendering pipeline; do not migrate to CodeMirror or replace the Markdown parser.
- Copy attachments beside the note under `assets/`, use relative Markdown links, and keep file operations behind Tauri commands with path validation and a 20 MB copy limit.
- Support attachment paste/drop, interactive task checkboxes, callouts, wikilinks, and inline/block math tokens.
- Math tokens remain readable text; this release does not add KaTeX typesetting.
- Defer graph view, Dataview/Bases, Canvas, full `![[embed]]` transclusion, and CodeMirror live preview.

## Implementation map

- Markdown extensions and sanitization: `src/lib/markdown.ts`
- Attachment paths and classification: `src/lib/attachments.ts`
- Paste/drop, task updates, and note workflows: `src/App.tsx`
- Preview interactions: `src/components/Preview.tsx`
- Validated attachment copy: `src-tauri/src/lib.rs`, exposed through `src/lib/tauri.ts`
- Coverage: `tests/frontend/lib/attachments.test.ts`, `tests/frontend/lib/markdown.test.ts`, `tests/frontend/components/Preview.checkboxes.test.tsx`, and `tests/frontend/app/App.test.tsx`
