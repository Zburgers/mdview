# ADR-0002: Modular Markdown Rendering Pipeline

## Status

Proposed

## Date

2026-10-05

## Deciders

- @naki

## Context

mdview 1.2.5 has accumulated useful rendering features inside `src/lib/markdown.ts` and `src/components/Preview.tsx`: GFM parsing, sanitization, callouts, wikilinks, math, task interactions, local-image authorization, Mermaid rendering, and navigation.

The next product goal is a much more complete document reader: deterministic heading navigation and Outline metadata, ordinary local Markdown links, resilient local images, richer Mermaid/chart rendering, syntax-highlighted code, footnotes, expanded callouts, and better reader UX.

Adding those features directly to the existing helper/component would make `Preview.tsx` responsible for parsing, policy, filesystem authorization, DOM transformation, interactive controls, and navigation. It would also preserve module-level mutable state currently used by math rendering.

The renderer remains a security boundary because Markdown is untrusted input.

## Decision Drivers

- Preserve the v1.2.5 sanitization and resource-security model.
- Make rendering features independently testable.
- Produce structured heading/resource metadata for the Outline and future workspace work.
- Avoid duplicate parsing.
- Avoid global mutable render state.
- Keep the desktop application lightweight and offline-capable.
- Ship visible rendering improvements without a high-risk parser migration.
- Keep graph/backlink/workspace indexing out of v1.3.

## Considered Options

### Option 1: Modularize the current Marked/DOMPurify pipeline

Create a `src/rendering/` subsystem around Marked, DOMPurify, KaTeX, Mermaid, and controlled Tauri resource resolution. Instantiate per-render state and return a structured `RenderResult`.

Pros:

- Reuses hardened v1.2.5 behavior.
- Lowest migration risk.
- Marked supports custom extensions.
- Keeps DOMPurify as an explicit hard boundary.
- Supports incremental TDD tasks.
- Makes heading/resource metadata available without a second parser.

Cons:

- Some rich blocks still require controlled DOM enhancement after sanitized HTML insertion.
- Marked extensions need disciplined per-render state management.
- The project continues to own a small amount of Markdown-extension code.

### Option 2: Migrate to unified/remark/rehype

Pros:

- Strong AST ecosystem.
- Natural transform pipeline.
- Many Markdown plugins available.

Cons:

- Replaces the parser and extension ecosystem during a rendering-stability release.
- Requires re-validating raw HTML, sanitization, task editing, math, Mermaid, links, and resource policy.
- Adds dependency and bundle complexity.
- Provides limited immediate user-visible benefit compared with modularizing the current stack.

### Option 3: Render Markdown directly as React/MDX components

Pros:

- Interactive elements become React components.
- Fine-grained control over block rendering.

Cons:

- Expands the content execution/trust surface.
- Conflicts with mdview's current "untrusted Markdown becomes sanitized inert HTML" model.
- Larger rewrite and higher complexity than required.

## Decision

Select **Option 1**.

mdview v1.3 will keep Marked + DOMPurify as the primary Markdown-to-safe-HTML path and factor rendering into a dedicated subsystem with explicit contracts and per-render state.

The architectural boundary is:

```text
source
  -> parser/extensions
  -> untrusted HTML + metadata
  -> sanitizer
  -> RenderResult
  -> Preview enhancers
       -> Tauri-authorized local resources
       -> Mermaid render + SVG sanitizer
       -> controlled interactive UI
```

The renderer must return structured metadata, including headings. Preview behavior must consume that metadata instead of rediscovering document structure from arbitrary DOM text.

## Rationale

This option improves the architecture while preserving the security properties already established in v1.2.5. It gives mdview the primitives needed for Outline and future workspace indexing without turning v1.3 into a parser rewrite.

A full AST-stack migration is not ruled out forever. It should only be reconsidered when a concrete future feature cannot be expressed cleanly through Marked tokens/extensions and the structured render contract.

## Consequences

### Positive

- Smaller and testable module boundaries.
- Stable heading IDs and reusable outline metadata.
- One parse can feed both reader HTML and surrounding navigation UI.
- Existing callout, wikilink, math, Mermaid, task, and resource behavior can migrate incrementally.
- Future diagnostics/resource inspection can use `RenderResult` without scraping HTML.
- Security policy remains centralized and explicit.

### Negative

- v1.3 includes refactoring before some visible features land.
- DOM enhancement remains necessary for Mermaid, image authorization, search highlighting, and interactive controls.
- Marked-specific extension code remains part of mdview.

### Risks

- Moving extensions can accidentally widen the sanitizer or regress current syntax.
  - Mitigation: preserve existing regression tests and add fixture-driven parity tests before deleting legacy helpers.
- A new structured result could cause double parsing if Outline and Preview render independently.
  - Mitigation: render once in the active-document layer/hook and pass the same result to Preview and Outline.
- Broadening local relative image handling to `../` increases what an opened document can cause the app to display.
  - Mitigation: keep resolution in Rust; canonicalize; require a regular supported image file; enforce size limits; reject absolute and privileged URI schemes; keep network fetching off by default.
- Mermaid and syntax highlighting can increase frontend bundle size.
  - Mitigation: keep the pinned Mermaid 11.x line for v1.3 and import only Highlight.js common/core languages.

## Implementation Notes

- Proposed new modules:
  - `src/rendering/types.ts`
  - `src/rendering/render.ts`
  - `src/rendering/parser.ts`
  - `src/rendering/security.ts`
  - `src/rendering/extensions/`
  - `src/rendering/enhancers/`
- `src/lib/markdown.ts` becomes a temporary compatibility facade during migration and should no longer own the final renderer after v1.3.
- `src/components/Preview.tsx` should receive a `RenderResult` instead of initiating the full parse itself once the active-document render hook lands.
- Ordinary local Markdown links should reuse `App.openPath(path, heading)` after a new Rust resolver authorizes the document-relative path.
- Fenced Mermaid compatibility is the contract. Standalone Mermaid promotion remains best-effort legacy behavior.
- Add `highlight.js` using a common/core import for code fences.
- Prefer the maintained `marked-footnote` extension for footnotes if its output satisfies the sanitizer/accessibility tests.
- Do not bump package/application versions on the planning or implementation feature branch.

## Related Decisions

- ADR-0001: Enforce ADR Governance for Push and Release Workflows (Proposed)

## References

- `docs/plans/2026-10-05-v1.3-rendering-engine-design.md`
- `docs/security/markdown-rendering-sandbox.md`
- `AGENTS.md`
- https://marked.js.org/
- https://obsidian.md/help/syntax
- https://obsidian.md/help/callouts
- https://obsidian.md/help/plugins/outline
- https://support.typora.io/Images/
