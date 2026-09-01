# Research: In-App Markdown Rendering — Obsidian Model Applied to mdview 1.2.5

**Branch:** `1.2.5`  
**Date:** 2026-09-01  
**Status:** Research complete — feeding design

---

## 1. Question

How does Obsidian do native-feeling Markdown rendering, and what can mdview borrow for 1.2.5 without abandoning local-first Tauri + `marked` + sanitized preview?

User asked for:
- native copy-paste of images (auto-render after paste)
- drag from file explorer → paste path or embed image in rendered view
- rich text rendering: graphs, mermaid charts, lists, bullet points, checkboxes that are *usable and persist*
- any extra markdown-text rendering affordances we find

---

## 2. mdview Today (v1.2.3 → 1.2.4)

### Architecture
- **Frontend:** React + Vite + TypeScript (`src/App.tsx` ~890 lines, `src/components/Preview.tsx` ~125 lines)
- **Markdown pipeline:** `src/lib/markdown.ts` — isolated `Marked` instance (not global `marked`), GFM on, custom `renderer.link` preserving inline code inside links, then `DOMPurify.sanitize()` with tight allowlist, then `removeRemoteImageSources()` unless `allowRemoteImages` is on.
- **Mermaid:** `promoteStandaloneMermaid()` auto-wraps bare `graph TD` etc. at block boundaries into ```` ```mermaid ````; `Preview.tsx` renders with `mermaid.render()` + `sanitizeMermaidSvg()` (SVG profile, strips `script`/`foreignObject`/`on*`). `securityLevel: "strict"`, CSP `default-src 'self'`.
- **Preview interactivity:** read-only. Task lists get `task-list-item` class, but `<input type="checkbox" disabled>` — not clickable. External links intercepted → `ask()` confirm → `openUrl()`. Images with relative src are resolved via `convertFileSrc(base/file)` using `filePath` ancestor. Search highlighting via `src/lib/highlight.ts` tree walker. No clipboard/drag handlers for *content insertion* — drag-drop only opens markdown files (`tauri://drag-drop` → `isMarkdownLikePath`).
- **Editing:** plain `<textarea>` in Source/Split (`App.tsx: sourceRef`), `ViewMode = reader | split | source`, plain `markdown` string state, `dirty` flag, explicit Save/SaveAs via Tauri commands `read_markdown_file`/`write_markdown_file` (`src-tauri/src/lib.rs`). No paste processing, no cursor-aware insertion.
- **Security posture:** solid — DOMPurify everywhere, strict CSP, remote images blocked by default, local images scoped to document directory via `convertFileSrc`, settings persisted atomically (`settings.json` + `.bak`/`.tmp`/`.corrupt` handling).

### Strengths to keep
- Isolated `Marked` + single sanitization gate (good pattern echoed in other projects).
- Strict Mermaid SVG sanitization — matches recommended `mermaid + DOMPurify` guidance.
- Atomic settings persistence already handles corruption.
- Local-first, no network `connect-src 'none'` — fits Obsidian vault ethos.

### Gaps vs Obsidian wish-list
1. **Image paste/drop:** no handler; images must be manually typed as `![](path)`.
2. **File drag:** only accepts `.md/.txt` family; ignores images/PDFs; never inserts a link at cursor.
3. **Checkboxes:** disabled — cannot toggle, no source mutation.
4. **Obsidian syntax:** no `[[wikilink]]`, `![[embed]]`, `> [!NOTE]` callouts, `$math$`, block refs, tags. Marked alone doesn't parse them.
5. **No attachment management:** no copy-to-`assets/` pipeline, no relative path rewriting.
6. **Graph view:** none (Obsidian's vault graph is N files + backlinks; mdview is single-file viewer).

---

## 3. How Obsidian Does It

### 3.1 Editor: CodeMirror 6 Live Preview
- Obsidian desktop is **CodeMirror 6** with a `ViewPlugin` that decorates markdown on each line. When cursor is *not* on a line, decorations hide markup (`#`, `**`, `` ` ``) and render inline preview (headings, bold, code, callouts, LaTeX). When cursor enters, decorations are removed to reveal raw syntax. Document text is never mutated — `safeBuild` fallback degrades to plain markdown on failure.
- Reference pattern: `codemirror-live-markdown` (open source) implements identical idea — modular CM6 plugins per markdown token type, `Decoration.replace()` / `WidgetType`.
- Other analyzers (e.g., `haraldrevery/revery_notebook`) confirm: render = decorations only, saves/autosave/undo operate on raw markdown.

### 3.2 Attachment / Paste / Drop Pipeline
From plugin/community patterns (`obsidian-better-images`, `obsidian-image-flow`, `msh-01/obsidian-blob-upload`, `mattpetters/zed` vault notes):
- Listens to `paste` and `drop` on the editor.
- **Clipboard path:** `electron.clipboard.readFilePaths()` first (real filename + binary), then `clipboardData.files`, then raw image data (screenshot → `Pasted image 20260901…png`).
- **Classify by extension** (`utils/file-classification.ts` pattern): image vs PDF vs markdown vs other.
- **Images:** copy to vault's `attachmentsFolder` (default `_attachments/` or per-note `./assets`, `notename_datetime.ext`), generate `![[image.png]]` (wikilink embed) or `![](attachments/img.png)` depending on setting, insert at cursor.
- **Files:** insert `[[note]]` wikilink for markdown notes, `![[file.pdf]]` or `[label](path)` for others. Relative path preferred for portability.
- **Limits:** 20 MB cumulative enforcement in reference implementations; external drops get confirm modal (`always-confirm` vs `external-only` policy).

### 3.3 Markdown Extensions Beyond GFM
Specs from `laudantstolam/obsidian-markdown` and `yhekma/vaultview`:

| Syntax | Example | Rendering |
|---|---|---|
| Wikilinks | `[[Note]]`, `[[Note\|Alias]]`, `[[Note#Heading]]`, `[[Note^blockId]]` | Link to note, alias display, heading anchor, block ref |
| Embeds / Transclusion | `![[Note]]`, `![[image.png]]`, `![[Note#Heading]]` | Inline render of note/image/heading |
| Callouts | `> [!NOTE] Title\n> body` | Colored box with icon, foldable `> [!NOTE]+` (collapsed) |
| Tasks | `- [ ]`, `- [x]`, `- [/]`, etc. (with Tasks plugin: `[/]`, `[!]`) | Checkbox, queryable via Dataview/Tasks |
| Properties | YAML frontmatter | Rendered as table/properties view |
| Tags | `#tag`, `#nested/tag` | Link + graph inclusion |
| Math | `$inline$`, `$$block$$` | MathJax v3 |
| Highlights | `==mark==` | `<mark>` |
| footnotes, comments | `[^1]`, `%%comment%%` |  |
| Bases, Dataview, Canvas, Graph | `.base` YAML → table, `dataview` code block → live query, `canvas` JSON, graph view | Vault-level features |

Implementation in community: `markdown.previewScripts` registers `markdownItPlugins` with custom block rules (`mps_wikilink`, `mps_embed`, `mps_callouts`) on `markdown-it`; preview script post-processes wikilinks via workspace-wide resolution. Read-then-render pipeline stays `marked`/`markdown-it` → DOMPurify → decorators.

### 3.4 Graph-Related Features
- **Graph View:** nodes = notes, edges = wikilinks/outgoing links/backlinks + tags/frontmatter interpretation. Filtered interactive canvas (force layout).  
- **Bases / Dataview:** live query blocks (`TABLE`, `LIST`, `TASK`) evaluated against vault index.
- **Canvas:** JSON whiteboard with note/text/card nodes, not markdown.
- None are per-file; all require a vault index.

### 3.5 Security Parallels
Obsidian also runs strict sanitization; docs and community recommend `marked → DOMPurify → mermaid.run()` with SVG profile forbidding `script`/`foreignObject` — exactly what mdview already does. Good to preserve.

---

## 4. Engine Landscape (What mdview could use)

| Engine | Fit for mdview | Pros | Cons |
|---|---|---|---|
| **marked** (current) | Already adopted | Tiny, isolated instance pattern, GFM, fast, mermaid-friendly, extensible via `Renderer` | No wikilink/callout grammar; needs custom extensions |
| **markdown-it** | Drop-in alternative | Rich plugin ecosystem (`markdown-it-callouts`, `markdown-it-wikilinks`, math, emoji, footnotes) | Heavier rewrite of `src/lib/markdown.ts`; still needs DOMPurify |
| **unified / remark / rehype** | Powerful AST | Full AST for graph indexing, callouts as directive plugins, typed | Largest bundle, more complex build, removed by some projects to *reduce* weight (e.g., `samvera-labs/clover-iiif` swapped unified → marked) |
| **CodeMirror 6** (editor) | Future editor upgrade | True live preview, offline decoration, undo-safe | Rewrites `App.tsx` editing model; biggest 1.2.5 cost |

Finding: staying on `marked` keeps bundle small and aligns with recent "unify on marked instances" guidance (`intrafind/ihub-apps #1834`, `subinium/crowclaw #243`). We can add small `marked` extensions for callouts/wikilinks/math without switching parser.

---

## 5. What to Borrow for mdview (Ranked by User Answers)

User chose:
- Images: **copy to `assets/` next to file** (A)
- Checkboxes: **auto-write on click** (A)
- Drag non-image: **insert relative link** (A)
- Editing: **enhance current textarea+marked** (A)
- Scope extras: **callouts + wikilinks + math** (A)

Derived priority (MoSCoW for 1.2.5):

**Must (core promise)**
- Paste handler: `clipboard.readFilePaths` / `clipboardData.files` / `item.getAsFile()` → detect image → copy via new Tauri command `copy_attachment` to `{markdownDir}/assets/{basename}` (collision-safe) → insert `![alt](assets/file)` at cursor, scroll source into view.
- Drag handler: `dragover`/`drop` on textarea + preview, classify by `isMarkdownLikePath` + image extensions, same copy pipeline, else insert `[filename](relPath)`.
- Checkbox interactivity: make `renderMarkdown` emit `data-task-index` (or `data-line`), Preview delegates click on `.task-list-item input[type=checkbox]` → compute line number → flip `- [ ]` ↔ `- [x]` in source → update tab state + auto `writeMarkdownFile` if `path != null` (else keep dirty).
- Preserve sanitization: new image srcs are `assets/...` relative → already allowed; still run DOMPurify with same allowlist, extend to allow `data-line` attr if used.

**Should (scope A extras)**
- **Callouts:** `> [!NOTE]` / `>[!WARNING]` etc. — extend `marked` via `markedExtension` that tokenizes blockquote starting with `[!TYPE]`, render as `<div class="callout callout-note"><div class="callout-title">…`, styled in `styles.css`. Support `+`/`-` fold marker.
- **Wikilinks:** `[[name]]` / `[[name|alias]]` / `[[name#heading]]` — marked extension → `<a data-wikilink="name" href="#wikilink-name">alias</a>`; click resolves relative to `filePath` dir or searches `recentFiles` — if file exists, `openMarkdownWindow`/`openPath`, else status "Linked note not found".
- **Math:** `$inline$` / `$$block$$` via lightweight `marked` extension + KaTeX (or MathJax) — render with `katex.renderToString` (post-sanitize? carefully inline), CSP allow `style-src 'unsafe-inline'` already present, keep `connect-src 'none'` so no CDN.
- Polish Mermaid: keep strict mode, ensure SVG sanitization stays separate; no changes needed except ensure paste/drop doesn't break mermaid blocks.

**Could (defer)**
- Vault graph view: needs index over `recentFiles` + file scan — defer to 1.3.x, but reserve type `GraphNode { id, label, links }` for future.
- Dataview-style queries / Bases / Canvas: out of scope for single-file viewer.
- Transclusion `![[note]]` full embed: requires reading linked note — could render as inline preview card, but defer.

**Won't (1.2.5)**
- Replace textarea with CodeMirror 6 live preview (explicitly chosen as not now).
- Base64 embed (user rejected).
- Absolute-path-only links.

---

## 6. Risks & Constraints

- **Local-first & sandbox:** new Tauri commands `copy_attachment` / `resolve_attachment_dir` must validate paths stay inside allowed markdown-like dirs, prevent traversal, handle collision, and use `convertFileSrc` for preview. Must not broaden CSP or allow `script` in markdown.
- **Autosave on checkbox:** user selected auto-write; must still respect `read_markdown_file`/`write_markdown_file` existing atomic write path and debounce rapid toggles.
- **Cursor insertion:** textarea paste/drop needs `selectionStart`/`selectionEnd` handling and scroll preservation.
- **Copy of large images:** 20 MB guard (like Obsidian reference) is prudent.
- **Testing:** Vitest `jsdom` can test paste/drop → link insertion and checkbox line mutation without Tauri backend via mocked `invoke`.

---

## 7. Sources

- Obsidian CodeMirror live preview patterns: `joshxfi/noteside`, `haraldrevery/revery_notebook`, `rauglothgor/anitgravity-live-preview`, `conql/codemirror-live-markdown`
- Attachment pipeline specs: `noki1213/obsidian-better-images`, `chillcharlie357/obsidian-image-flow`, `msh-01/obsidian-blob-upload`, `mattpetters/zed#1` (vault image paste → `_attachments/`, wikilink insert), `alberti42/obsidian-import-attachments-plus`
- Markdown extensions survey: `yhekma/vaultview`, `inkstone/CLAUDE.md`, `laudantstolam/obsidian-skills`, `slash-hug/revenant#38` (md-it-callouts + wikilinks plan)
- Sanitization chain guidance: `pellera9/alex_act_core`, `drtamar/alex_skill_mall` (`marked → DOMPurify → Mermaid`), `intrafind/ihub-apps#1834` (isolated Marked instances)
- Engine comparison: `samvera-labs/clover-iiif#337` (unified → marked), `subinium/crowclaw#243`, `r-hashi01/mdeditor` (marked+DOMPurify+mermaid+draw.io inline SVG)
- Basalt (`oweneldridge/basalt`) notes vault-compatible alternative proving markdown+graph can sit beside Obsidian vault format.

---

## 8. Next

Feed into `docs/plans/2026-09-01-obsidian-features-design.md` with concrete Tauri commands, marked extensions, and test plan for branch `1.2.5`.
