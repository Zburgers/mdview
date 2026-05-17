# Architecture

`mdview` v2 uses Tauri v2 with a Rust backend and React/Vite TypeScript frontend.

The frontend owns layout, Markdown rendering, sanitization, Mermaid rendering,
view modes, search, theming, and print CSS.

The Rust backend stays narrow: open/read selected files, save files, and persist
settings. It rejects non-Markdown/text-like extensions and decodes invalid UTF-8
lossily with a warning instead of crashing.

Security model:

- Tauri capabilities are explicit and minimal.
- Rendered Markdown is sanitized with DOMPurify.
- Raw scripts, frames, objects, and forms are not allowed.
- External links are intercepted and opened through Tauri opener after user
  action.
- Runtime network loading is not part of Markdown rendering.
