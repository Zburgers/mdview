# Obsidian-Style Rendering 1.2.5 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add Obsidian-like paste/drag image pipeline (copy to `assets/`), clickable auto-saving checkboxes, and callouts/wikilinks/math rendering to mdview while keeping the local-first `marked` + `DOMPurify` + strict Mermaid pipeline.

**Architecture:** Enhance current `textarea` + isolated `Marked` model (no CodeMirror in 1.2.5). New `attachments.ts` for classification/rel-path helpers, new Tauri command `copy_attachment` for file copies with size/traversal guards, `marked` extensions for callouts/wikilinks/math, and `Preview.tsx`/`App.tsx` delegates for checkbox toggles and paste/drop insertion at cursor.

**Tech Stack:** React + TypeScript, `marked` + `DOMPurify` + `mermaid` (strict), `katex` for math, Tauri v2 Rust (`plugin-fs`/`plugin-dialog`), Vitest `jsdom`, `convertFileSrc` for local images.

---

## Task 1: Attachments helper (`src/lib/attachments.ts`)

**Files:**
- Create: `src/lib/attachments.ts`
- Test: `tests/frontend/lib/attachments.test.ts`

**Step 1: Write the failing test**

```ts
// tests/frontend/lib/attachments.test.ts
import { describe, expect, it } from "vitest";
import { classifyAttachment, markdownForAttachment, relativePosix } from "../../../src/lib/attachments";
describe("attachments", () => {
  it("classifies images vs files", () => {
    expect(classifyAttachment("photo.png")).toBe("image");
    expect(classifyAttachment("doc.pdf")).toBe("file");
  });
  it("builds relative posix path", () => {
    expect(relativePosix("/a/b/c.md", "/a/b/assets/x.png")).toBe("assets/x.png");
  });
  it("builds markdown strings", () => {
    expect(markdownForAttachment("image", "assets/x.png", "x.png")).toBe("![x.png](assets/x.png)");
    expect(markdownForAttachment("file", "assets/doc.pdf", "doc.pdf")).toBe("[doc.pdf](assets/doc.pdf)");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm test -- tests/frontend/lib/attachments.test.ts`
Expected: FAIL — module not found `src/lib/attachments.ts`

**Step 3: Write minimal implementation**

```ts
// src/lib/attachments.ts
const imageExts = new Set(["png","jpg","jpeg","gif","webp","avif","svg","bmp","tiff"]);
export type AttachmentKind = "image" | "file";
export function classifyAttachment(name: string): AttachmentKind {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return imageExts.has(ext) ? "image" : "file";
}
export function relativePosix(fromFile: string, toFile: string): string {
  // fromFile is full path to markdown doc; toFile is dest file
  const fromDir = fromFile.split(/[\\/]/).slice(0,-1).join("/");
  if (!fromDir) return toFile.split(/[\\/]/).pop() ?? toFile;
  const rel = toFile.startsWith(fromDir + "/") ? toFile.slice(fromDir.length+1) : toFile;
  return rel.replaceAll("\\","/");
}
export function markdownForAttachment(kind: AttachmentKind, relPath: string, name: string): string {
  return kind === "image" ? `![${name}](${relPath})` : `[${name}](${relPath})`;
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm test -- tests/frontend/lib/attachments.test.ts`
Expected: PASS (3/3)

**Step 5: Commit**

```bash
git add src/lib/attachments.ts tests/frontend/lib/attachments.test.ts
git commit -m "feat: add attachments helper for image/file classification"
```

---

## Task 2: Tauri copy_attachment command

**Files:**
- Modify: `src-tauri/src/lib.rs:300-345` (add command after `write_markdown_file`)
- Modify: `src/lib/tauri.ts:1-40` (add `copyAttachment` wrapper)
- Test: `src-tauri/src/lib.rs` (cargo test inline)

**Step 1: Write the failing test (Rust)**

Add in `#[cfg(test)] mod tests` in `src-tauri/src/lib.rs`:
```rust
#[test]
fn copy_attachment_rejects_oversized()
#[test]
fn copy_attachment_handles_collision()
#[test]
fn copy_attachment_rejects_traversal()
```
Initially not present → cargo test will fail to find command.

**Step 2: Run test to verify it fails**

Run: `cd src-tauri && cargo test copy_attachment -- --nocapture`
Expected: FAIL — not found

**Step 3: Write minimal implementation**

In `src-tauri/src/lib.rs` add:
```rust
#[tauri::command]
fn copy_attachment(src: String, dest: String) -> Result<String,String> {
  let src_path = PathBuf::from(&src);
  let dest_path = normalize_user_file_path(&dest)?;
  let meta = fs::metadata(&src_path).map_err(|e| format!("src not readable: {e}"))?;
  if meta.len() > 20*1024*1024 { return Err("File too large (20MB limit)".into()); }
  if let Some(parent)=dest_path.parent(){ fs::create_dir_all(parent).map_err(|e|format!("mkdir: {e}"))?; }
  let final_path = if dest_path.exists() {
    let stem = dest_path.file_stem().and_then(|s|s.to_str()).unwrap_or("file");
    let ext = dest_path.extension().and_then(|e|e.to_str()).map(|e|format!(".{e}")).unwrap_or_default();
    let parent = dest_path.parent().unwrap();
    let mut n=1; let mut cand;
    loop{ cand = parent.join(format!("{stem} ({n}){ext}")); if !cand.exists() { break; } n+=1; }
    cand
  } else { dest_path };
  fs::copy(&src_path, &final_path).map_err(|e|format!("copy failed: {e}"))?;
  Ok(final_path.to_string_lossy().to_string())
}
```
Register in `invoke_handler!` alongside `write_markdown_file`. Validate traversal: if `dest` contains `..` components canonicalized outside expected parent → error.

In `src/lib/tauri.ts`:
```ts
export function copyAttachment(src: string, dest: string): Promise<string> {
  return invoke("copy_attachment", { src, dest });
}
```

**Step 4: Run tests**

Run: `cd src-tauri && cargo test -- --nocapture`
Expected: PASS (existing + new)

**Step 5: Commit**

```bash
git add src-tauri/src/lib.rs src/lib/tauri.ts
git commit -m "feat: add copy_attachment Tauri command with 20MB guard"
```

---

## Task 3: Markdown extension — Callouts

**Files:**
- Modify: `src/lib/markdown.ts:1-20` (add extension)
- Test: `tests/frontend/lib/markdown.test.ts` (add cases)

**Step 1: Write the failing test**

```ts
it("renders obsidian callouts", async () => {
  const html = await renderMarkdown("> [!NOTE] Title\n> body text");
  expect(html).toContain('class="callout callout-note"');
  expect(html).toContain("Title");
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm test -- tests/frontend/lib/markdown.test.ts -t "callouts"`
Expected: FAIL — missing callout markup

**Step 3: Write minimal implementation**

In `src/lib/markdown.ts`, before `markedParser` creation:
```ts
const calloutExtension = {
  name: "callout",
  level: "block" as const,
  start(src:string){ return src.indexOf("> [!"); },
  tokenizer(src:string){
    const m = /^>\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]([+-]?)\s*(.*)\n?(.*(?:\n>.*)*)?/.exec(src);
    if(!m) return;
    return { type:"callout", raw:m[0], calloutType:m[1].toLowerCase(), fold:m[2], title:m[3], text:m[0] };
  },
  renderer(token:any){ return `<div class="callout callout-${token.calloutType}" data-callout="${token.calloutType}" data-fold="${token.fold}"><div class="callout-title">${token.title}</div><div class="callout-body">${this.parser.parse(token.text.replace(/^> ?/gm,""))}</div></div>`; }
};
markedParser.use({ extensions:[calloutExtension] });
```
Add `data-callout` etc. to `ALLOWED_ATTR` allowlist.

**Step 4: Run test**

Run: `pnpm test -- tests/frontend/lib/markdown.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/markdown.ts tests/frontend/lib/markdown.test.ts
git commit -m "feat: render obsidian callouts in marked pipeline"
```

---

## Task 4: Markdown extension — Wikilinks

**Files:**
- Modify: `src/lib/markdown.ts`
- Test: `tests/frontend/lib/markdown.test.ts`

**Step 1: Write failing test**

```ts
it("renders wikilinks with alias and heading", async () => {
  const html = await renderMarkdown("See [[My Note|Alias]] and [[Note#Heading]]");
  expect(html).toContain('data-wikilink="My Note"');
  expect(html).toContain("Alias");
  expect(html).toContain('data-heading="Heading"');
});
```

**Step 2: Run test → FAIL**

**Step 3: Implement inline extension** (regex `\[\[([^\]|#^]+)(?:\|([^\]]+))?(?:#([^\]|^]+))?`).

Map to `<a class="wikilink" data-wikilink="target" href="#wikilink-target">alias</a>`. Allow attrs in DOMPurify.

**Step 4: Run test → PASS**

**Step 5: Commit**

```bash
git add src/lib/markdown.ts tests/frontend/lib/markdown.test.ts
git commit -m "feat: add wikilink rendering"
```

---

## Task 5: Math rendering (KaTeX)

**Files:**
- Modify: `package.json` (add `katex`), `src/lib/markdown.ts`
- Test: `tests/frontend/lib/markdown.test.ts`

**Step 1: Install and failing test**

Run: `pnpm add katex && pnpm add -D @types/katex` (if needed)

Test:
```ts
it("renders inline math", async () => {
  const html = await renderMarkdown("Euler $e^{i\\pi} = -1$");
  expect(html).toContain("katex");
});
```

**Step 2: Run → FAIL**

**Step 3: Implement:** inline `$…$` and block `$$…$$` extensions using `katex.renderToString(str,{throwOnError:false})` fallback to `<code>`.

**Step 4: Run → PASS**

**Step 5: Commit**

```bash
git add package.json pnpm-lock.yaml src/lib/markdown.ts tests/frontend/lib/markdown.test.ts
git commit -m "feat: add katex math rendering"
```

---

## Task 6: Checkbox interactivity (Preview + App toggle)

**Files:**
- Modify: `src/components/Preview.tsx` (make checkboxes enabled, delegate change)
- Modify: `src/App.tsx` (add `handleToggleTask(line:number)`)
- Test: `tests/frontend/components/Preview.checkboxes.test.tsx` (new)

**Step 1: Write failing test**

```tsx
import { render, screen } from "@testing-library/react";
import { Preview } from "../../../src/components/Preview";
it("calls onToggleTask when checkbox clicked", async () => {
  let line=-1;
  render(<Preview markdown={"- [ ] task\n- [x] done"} filePath="/a/b.md" theme="light" searchQuery="" allowRemoteImages={false} onToggleTask={(l)=>line=l} />);
  // wait for render then click checkbox — expect line 0
});
```
Initially prop doesn't exist → TS error / test fails.

**Step 2: Run test → FAIL**

**Step 3: Implement Preview.tsx changes:**
- Extend `MarkdownRenderOptions` type? Actually add `onToggleTask` prop.
- In `renderMarkdown`, inject `data-line` via line scan (or tokenizer).
- In `useEffect([html,…])`, `root.querySelectorAll('.task-list-item input').forEach(i=>i.removeAttribute('disabled'))` and `root.addEventListener('change', handler)` with `dataset.line`.
- In `src/lib/markdown.ts` DOMPurify allow `data-line`.

App.tsx `handleToggleTask`: split markdown by `\n`, flip ` [ ]` ↔ `[x]` on that line, `updateActiveDocument`, if `path` then `writeMarkdownFile`.

**Step 4: Run test → PASS**

**Step 5: Commit**

```bash
git add src/components/Preview.tsx src/App.tsx src/lib/markdown.ts tests/frontend/components/Preview.checkboxes.test.tsx
git commit -m "feat: interactive checkboxes with auto-save"
```

---

## Task 7: Paste handler for images

**Files:**
- Modify: `src/App.tsx` (add `onPaste` on textarea ref)
- Test: `tests/frontend/app/App.test.tsx` (mock invoke for copyAttachment, simulate paste)

**Step 1: Write failing test** – simulate paste event with `clipboardData.files = [new File(["bytes"],"img.png",{type:"image/png"})]`, expect `copyAttachment` called and markdown spliced.

**Step 2: Run → FAIL**

**Step 3: Implement:** `onPaste` handler extracts file, calls `copyAttachment(srcTemp, destPath)` where `destPath = mdDir + "/assets/" + sanitize(name)`. For clipboard images without path (screenshots), use `plugin-fs` temp write or invoke with bytes. Insert `markdownForAttachment` at `selectionStart`.

**Step 4: Run → PASS**

**Step 5: Commit**

```bash
git add src/App.tsx tests/frontend/app/App.test.tsx src/lib/tauri.ts
git commit -m "feat: paste images to assets with relative link"
```

---

## Task 8: Drag-and-drop handler

**Files:**
- Modify: `src/App.tsx` (add `onDragOver`/`onDrop` + extend existing `tauri://drag-drop` listener)
- Modify: `src/lib/attachments.ts` (ensure helper used)
- Test: `tests/frontend/app/App.test.tsx`

**Step 1: Write failing test** — drop `photo.jpg` and `report.pdf`, expect markdown link insertions.

**Step 2: Run → FAIL**

**Step 3: Implement:** `onDragOver` → `preventDefault`, visual cue. `onDrop` → for each file from `dataTransfer.files` or `event.payload.paths` (Tauri), classify, `copyAttachment` if outside `mdDir` else keep relative, splice markdown.

**Step 4: Run → PASS**

**Step 5: Commit**

```bash
git add src/App.tsx tests/frontend/app/App.test.tsx
git commit -m "feat: drag files to insert relative markdown links"
```

---

## Task 9: Styles for callouts / wikilinks / tasks

**Files:**
- Modify: `src/styles.css` (add `.callout`, `.wikilink`, `.task-list-item input` interactive)

**Step 1: Write visual test** – `tests/frontend/app/styles.test.ts` asserts computed class presence? Or manual check.

**Step 2: Implement CSS** (no failing test needed — visual).

**Step 3: Commit**

```bash
git add src/styles.css
git commit -m "style: callout, wikilink, and task checkbox styles"
```

---

## Task 10: Edge cases & hardening

**Files:**
- Modify: `src/App.tsx`, `src-tauri/src/lib.rs`, `tests/...`

Check: Untitled paste → prompt Save; 20MB limit error → `setStatus`; traversal `../` reject; collision naming; remote images still blocked; disabled checkbox fallback when toggle fails.

**Steps:** add tests for each edge, implement guards, run full suite:

Run: `pnpm test && pnpm typecheck && pnpm build && cd src-tauri && cargo check && cargo clippy -- -D warnings`

Commit finalize and push.

---

## Execution Handoff

Plan complete and saved to `docs/plans/2026-09-01-obsidian-features-implementation.md`. Two execution options:

**1. Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** - Open new session with executing-plans, batch execution with checkpoints

**Which approach?**
