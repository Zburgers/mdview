# mdview v2 Tauri Migration

`mdview` v2 replaces the public Python GTK installation path with a Tauri v2 desktop
application. The Python implementation remains in the repository as the legacy
reference app while the Tauri app becomes the default direction for packaged
desktop releases.

## Preserved Behavior

- Open and save Markdown files.
- Reader-first preview with split/source modes.
- GitHub-flavored Markdown rendering.
- Mermaid diagram rendering from bundled frontend dependencies.
- Light, dark, and system theme preferences.
- Recent files and local settings persistence.
- Print-friendly output for system print-to-PDF.

## Safety Changes

- Shell scripts are no longer the preferred install path.
- The app does not mutate system icon themes, desktop themes, or global user
  environment files as part of normal installation.
- File access is driven by user-selected paths, drag-and-drop paths, and explicit
  save paths handled by the Rust backend.
- Rendered Markdown is sanitized and raw script/iframe/object/form content is
  stripped.
- External links are intercepted and opened only through the Tauri opener after a
  click.

## Current Limitations

- Local image support is intentionally narrow and aimed at images near the opened
  document.
- Raw HTML remains untrusted by default.
- AppImage generation failed on the Fedora validation host because `linuxdeploy`
  could not strip Fedora `.relr.dyn` libraries. Ubuntu CI is configured as the
  primary AppImage build path.
- Windows and macOS installers must be produced on native CI runners.
