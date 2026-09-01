# Design: Obsidian-Style Rendering for mdview 1.2.5

**Branch:** `1.2.5`  
**Date:** 2026-09-01  
**Authors:** mdview team (research → design)  
**Status:** Draft — pending approval (brainstorming gate)  
**Research basis:** `docs/research/2026-09-01-obsidian-rendering-research.md`

---

## 0. Summary

Bring the most-loved Obsidian affordances into mdview's local-first Tauri app without rewriting the editor. Keep `marked` + `DOMPurify` + strict Mermaid. Add: paste/drag image pipeline (copy to `assets/` next to the note + relative link insert), clickable checkboxes that auto-save, Obsidian-flavored callouts/wikilinks/math, and polished drag-link insertion for non-image files. No CodeMirror migration in 1.2.5.

---

## 1. Goals / Non-Goals

**Goals**
- User can copy an image to clipboard (screenshot/file) and paste into mdview → file copied to `{docDir}/assets/{name}` → markdown `![…](assets/…)` appears and preview renders it via `convertFileSrc`.
- Dragging any file from the OS file manager onto mdview inserts the right markdown: images → `![]()`, other files → `[]()`, both with path relative to the note.
- Task list checkboxes (`- [ ]`, `- [x]`) are interactive in Preview; clicking toggles the source line and auto-saves if the note has a path.
- Lists, bullet points, Mermaid, and new extras (callouts `> [!NOTE]`, wikilinks `[[…]]`, math `$…$`) render correctly and remain sanitized.
- All new file I/O goes through Tauri commands with path validation, size guard (20 MB), and atomic-writes.

**Non-goals (1.2.5)**
- No vault graph view, Dataview/Bases queries, or Canvas.
- No CodeMirror 6 Live Preview migration.
- No `![[embed]]` full transclusion (wikilink click opens file instead).
- No base64 data-URI embeds, no absolute-only path mode.

---

## 2. Architecture

### 2.1 Stack stays the same
- `marked` (isolated `Marked` instance) → `DOMPurify` → `mermaid.render` → `sanitizeMermaidSvg` → `dangerouslySetInnerHTML`.
- CSP unchanged: `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' asset: data: blob: ...`.
- New dependencies (if needed): `katex` for math (small, no CDN), no new Tauri plugins beyond `plugin-fs` helpers already present.

### 2.2 New modules
```
src/lib/markdown.ts        # + callout + wikilink + math extensions; add data-line task marking
src/lib/attachments.ts     # NEW — classify, relative path helpers, paste/drop → markdown string
src/lib/tauri.ts           # + copyAttachment(), ensureAssetsDir()
src-tauri/src/lib.rs       # + copy_attachment command (fs::copy + dir ensure)
src/components/Preview.tsx # + checkbox click delegate → onToggleTask callback
src/App.tsx                # + paste/drop handlers on textarea + preview, onToggleTask impl
src/styles.css             # + .callout, .wikilink styles
```

### 2.3 Data flow (paste image)
```
clipboard paste event (App.tsx, on textarea or window)
  → extract file (clipboardData.files || dataTransfer.files)
  → classifyAttachment(file.name) → image?
  → invoke("copy_attachment", { src: tempPathOrBytes, destDir: assetsDir })
     Rust: validate path, create dir, avoid collision (name (1).png), size guard, fs::copy
  → compute rel path from docDir to destFile
  → splice markdown at cursor: `![alt](relPath)`
  → updateActiveDocument(...) + Preview re-renders via convertFileSrc
```

Text files dragged with same path but link form: `[filename](relPath)`.

---

## 3. Proposed Approaches (Trade-offs)

### Approach A — Enhance current textarea + marked (Recommended for 1.2.5)

**What:** Keep `textarea` + `marked`. Add handlers and 2–3 small marked extensions. Introduce 1 new Rust command.
**Pros:** Smallest diff, lowest risk, preserves sanitization chain and current save model, fits user's answer for editing. Fits single-file viewer mental model. Tests stay in Vitest `jsdom`.
**Cons:** No true WYSIWYG hiding of markup off-cursor; callouts/wikilinks are rendered only in Preview, not inline in source. Paste still needs Tauri clipboard glue for OS images (may need temporary IPC for file drop paths that `tauri://drag-drop` already gives).
**Cost:** ~3–5 days, no new editor dep.

### Approach B — Migrate editor to CodeMirror 6 Live Preview

**What:** Replace `textarea` with CM6 + `codemirror-live-markdown` decorations for inline rendering; keep `Preview` for print.
**Pros:** Closest to Obsidian fidelity: markup hides off-cursor, live callout/math/mermaid widgets in editor.
**Cons:** Rewrites `App.tsx` editing, sync-scroll, and search. Biggest regression risk. Bundle +50–120 KB. Requires CM6 theming per mdview theme preference. User explicitly deprioritized this.
**Cost:** 2–3 weeks, follow-up to 1.2.5.

### Approach C — Switch parser to markdown-it + plugin pack

**What:** Replace `marked` with `markdown-it` and use `markdown-it-callouts`, `markdown-it-wikilinks`, `markdown-it-katex`, etc.
**Pros:** Rich plugin marketplace, less custom tokenizer code.
**Cons:** Churn in `src/lib/markdown.ts` and tests; still needs DOMPurify+ Mermaid plumbing; heavier bundle than marked; no stronger editor benefit than Approach A.
**Cost:** 1 week parser swap for same end result.

**Recommendation:** **Approach A** for 1.2.5. Capture Approach B as 1.3 roadmap item with a spike behind a feature flag (`editorMode: "textarea" | "codemirror"`).

---

## 4. Detailed Design (Approach A)

### 4.1 Attachments helper (`src/lib/attachments.ts`)

```ts
export type AttachmentKind = "image" | "file";
export function classifyAttachment(name: string): AttachmentKind;
export function relativePosix(fromDir: string, toFile: string): string;
export function markdownForAttachment(kind: AttachmentKind, relPath: string, name: string): string;
// image → `![alt](relPath)`, file → `[name](relPath)`
// Handles collision: assets/foo.png → assets/foo 1.png fallback done in Rust.
```

Image detection: extensions `png,jpg,jpeg,gif,webp,avif,svg,bmp,tiff` (matches Tauri file association scope; keep allowlist explicit).

### 4.2 Tauri bridge (`src/lib/tauri.ts` + `src-tauri/src/lib.rs`)

- New command: `copy_attachment(srcPath: String, destPath: String) -> Result<String,String>`
  - `destPath` computed in frontend as `{mdDir}/assets/{sanitizedBaseName}`. Frontend ensures `mdDir` derived from `documentState.path`; if `path == null` (Untitled), prompt Save first.
  - Rust: validate `srcPath` exists, size <= 20 MiB (`fs::metadata`), ensure `dest_parent` exists (`create_dir_all`), collision loop `name (n).ext`, `fs::copy`, return final path string.
  - Reuses `ensure_markdown_like`? No — images are not markdown; validate by allowlist `["png","jpg",…,"pdf","txt"]` for drag files; reject executables.
- Optional helper: `ensure_attachments_dir(mdPath: String) -> String` returning dir path.

Security: reject path traversal (`..` components), refuse absolute `destPath` outside `mdDir` descendants, reuse `normalize_user_file_path`.

### 4.3 Markdown extensions (`src/lib/markdown.ts`)

Keep isolated `Marked` instance. Add three `marked.use()` extensions:

1. **Callouts** — block tokenizer: `^>\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]([+-]?)\s*(.*)$` inside blockquote. Render to `<div class="callout callout-{type}" data-callout="{type}" data-fold="{+|-|}">` with title row and body.
2. **Wikilinks** — inline tokenizer: `\[\[([^\]|#^]+)(?:\|([^\]]+))?(?:#([^\]|^]+))?(?:\^([^\]]+))?\]\]`. Render to `<a class="wikilink" data-wikilink="{target}" data-heading="{h?}" href="#wikilink-{slug}">{alias||target}</a>`.
3. **Math** — inline `$…$` (single) and block `$$…$$`. Render via `katex.renderToString` to `<span class="katex-inline">` / `<div class="katex-block">` with error fallback as `<code>`. KaTeX does not inject script.

All emitted HTML still passes through `DOMPurify.sanitize()` allowlist — add `class`, `data-wikilink`, `data-callout`, `data-line`, `data-task-index` to `ALLOWED_ATTR`.

Tasks: extend `addTaskListClasses` to also inject `data-line="{lineNo}"` by pre-scanning source lines. Enables toggle without re-parsing whole AST on click.

### 4.4 Preview interactivity (`src/components/Preview.tsx`)

- Existing mermaid + `convertFileSrc` + `highlightText` stays.
- Add `onToggleTask?: (line: number) => void` prop.
- In `useEffect([html,…])`, after `highlightText`, delegate:
  ```ts
  root.querySelectorAll('.task-list-item input[type="checkbox"]').forEach(el=> el.removeAttribute('disabled'))
  root.addEventListener('change', e=> {
    const cb = (e.target as HTMLInputElement);
    if (!cb.matches('.task-list-item input')) return;
    const line = Number(cb.dataset.line);
    onToggleTask?.(line);
  });
  ```
- Also delegate `.wikilink` clicks → callback `onOpenWikilink(target, heading)` (or handle via `classifyHref`-style).

### 4.5 App paste/drop (`src/App.tsx`)

- Add `onPaste` on `<textarea>` (and global `paste` when `documentState.isOpen`).
  - Prefer `event.clipboardData.files`, else `clipboardData.items` where `item.kind === 'file'`, else `text/plain` url paste (fallback to default).
  - If image file present → preventDefault → call `copyAttachment` → splice markdown.
  - Side effect: if `documentState.path == null` → prompt Save to get `mdDir`; offer to save as `Untitled.md` next to assets.
- Add `onDrop` + `onDragOver` on textarea container.
  - Read `event.dataTransfer.files` and `tauri://drag-drop` paths (already listening). For each file, classify, `copyAttachment` if needed (for outside-dir files, copy in), else keep relative path if already inside `mdDir`.
  - Insertion: at cursor `textarea.selectionStart`, or append if preview-only focus.
  - Files already inside `mdDir`: no copy, just rel-link.
- Checkbox toggle impl:
  ```ts
  function toggleTask(line: number) {
    const lines = documentState.markdown.split('\n');
    lines[line] = lines[line].replace(/^(-\s*)(\[[ x]\])/,
      (_, p1, p2)=> p1 + (p2 === '[ ]' ? '[x]' : '[ ]'));
    updateActiveDocument(d=> ({...d, markdown: lines.join('\n'), dirty: true}));
    if (documentState.path) writeMarkdownFile(documentState.path, lines.join('\n')).then(...);
  }
  ```

---

## 5. Styling

- `.callout` in `styles.css`: left border 3px, background `--panel-soft`, icon via `::before` (Lucide-like), fold arrow for `+`/`-`.
- `.wikilink`: dashed underline, `color: var(--accent)` hover solid.
- `.katex` inherits theme vars.
- Task checkboxes: remove `disabled` opacity, add `cursor:pointer`, `accent-color: var(--accent)`.

---

## 6. Testing Plan

- **Unit** (`tests/frontend/lib/markdown.test.ts`): callout render, wikilink alias/heading, math inline/block, sanitize keeps data attrs, remote images still blocked.
- **Preview** (`tests/frontend/components/Preview.checkboxes.test.tsx`): checkbox enabled, click triggers `onToggleTask` with correct line.
- **Attachments** (`tests/frontend/lib/attachments.test.ts`): classify, relative path, markdown string generation, collision-free naming (mocked).
- **App integration** (mocked `invoke`): paste image → `copy_attachment` called with dest inside `assets/`, markdown spliced at cursor.
- **Rust** (`src-tauri/src/lib.rs`): `copy_attachment` size guard, collision loop, traversal reject.

Manual QA: run `pnpm tauri dev`, paste screenshot, drag png/pdf from Nautilus/Dolphin, toggle checkbox in rendered preview, verify file on disk and `git status`.

---

## 7. rollout

- Behind no flag for 1.2.5 (small scope); keep KaTeX optional — if math block fails, render as code fallback.
- Branch `1.2.5` already pushed. Design + research docs committed before implementation (this doc).
- Next: invoke `writing-plans` skill to produce `docs/plans/...-implementation.md` with task breakdown.

---

## 8. Open Decisions (recorded per user answers)

- Image copy folder: `assets/` adjacent to markdown file (not configurable in 1.2.5; settings `attachmentsDir: "assets"` added later).
- Untitled handling: paste before save → prompt Save or create `~/Documents/mdview-attachments/` temp? Chosen: prompt Save as, else keep `Untitled` with in-memory link and defer copy until Save.
- Graph view: explicitly deferred; capture as `docs/adr/…-graph-deferred.md` if needed.
