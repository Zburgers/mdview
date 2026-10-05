# Roadmap

## Completed foundation

### v0.1 Viewer Foundation

- Tauri v2 app shell.
- Reader-first Markdown preview.
- Native open/save.
- Recent files.
- Light/dark/system theme.

### v0.2 Split/Dev Mode

- Split source and preview mode.
- Source-only mode.
- Sync scrolling.
- Better source editing affordances without becoming an IDE.

### v0.3 Export and Packaging

- Print-to-PDF polish.
- Linux AppImage, `.deb`, and `.rpm` release artifacts.
- Windows NSIS installer.
- macOS `.app` and `.dmg`.

### v1.0 Public Release

- Tauri-first public release.
- File association/open-with support.
- Native release assets across Linux, Windows, and macOS.
- Automated GitHub Actions release builds.

### v1.1–v1.2.5 Reliability and Rich Markdown Foundation

- Multi-document tabs and unsaved-change protection.
- Safer atomic persistence and release integrity.
- Sanitized Markdown preview and explicit external-link handling.
- Remote-image privacy controls.
- Tauri-authorized local-image loading.
- Mermaid hardening.
- Interactive task lists.
- KaTeX math.
- Callouts and wikilinks.
- Attachment paste/drop support.

## v1.3 Rendering Engine (qualification in progress)

v1.3 is intentionally a **document-rendering release**, not a workspace/graph release.

- Modular per-render pipeline with structured `RenderResult` metadata.
- Deterministic heading IDs.
- Collapsible responsive Outline with active-section tracking.
- Ordinary relative Markdown links that open/focus mdview tabs and support heading fragments.
- Robust document-relative local images, including nested/parent assets, spaces, Unicode, and visible failure states.
- Image lightbox.
- Syntax-highlighted code blocks with language labels and copy.
- Generic fenced Mermaid rendering across the pinned Mermaid 11.x grammar surface, including supported charts such as pie, XY, radar, and Sankey.
- Expanded Obsidian-compatible callout families.
- `==highlight==` syntax.
- Footnotes.
- Per-render bounded KaTeX.
- Wide-table containment and reader typography polish.
- Kitchen-sink rendering/security/performance regression corpus.

The implementation is on the `1.3.0` branch. Automated qualification and
platform smoke checks are recorded in the draft
[`v1.3.0` release notes](../releases/v1.3.0.md); this is not a released
version.

Design: [`../plans/2026-10-05-v1.3-rendering-engine-design.md`](../plans/2026-10-05-v1.3-rendering-engine-design.md)  
Plan: [`../plans/2026-10-05-v1.3-rendering-engine.md`](../plans/2026-10-05-v1.3-rendering-engine.md)  
ADR: [`../adr/0002-modular-markdown-rendering-pipeline/adr.md`](../adr/0002-modular-markdown-rendering-pipeline/adr.md)

## Later workspace direction

These are deliberately not v1.3 acceptance criteria.

### v1.4 Workspace Foundation

- Open Folder / Open Workspace.
- File tree and file operations.
- Workspace-scoped quick open.
- Workspace search.
- File watching across the opened workspace.

### v1.5 Connected Markdown

- Backlinks and unlinked mentions.
- Tags/properties indexing.
- Stronger wikilink resolution.
- Workspace-scoped embeds/transclusion.

### v1.6 Knowledge Graph

- Graph view.
- Local graph.
- Relationship filters and navigation.

### v1.7 Review and Document Intelligence

- Broken-link/resource diagnostics.
- Compatibility profiles.
- Rendered diffs.
- Review reports.

### v1.8 Agent Markdown

- Specialized `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, and instruction-file inspection.
- Context/token characteristics.
- Instruction hierarchy/conflict diagnostics.

The later version labels are directional, not release commitments. v1.3 should build reusable heading/link/resource metadata without prematurely implementing those workspace features.
