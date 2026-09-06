# Changelog

All notable changes to this project will be documented in this file.

## [1.2.4]

_Unreleased release candidate_

### Added
- Added a **Remote Images** preference that keeps external Markdown and raw HTML images blocked by default.
- Added native confirmation before HTTP and HTTPS links open in the operating system's default browser.
- Added native error and blocked-link dialogs for failed, local-file, or unsupported navigation attempts.
- Added Mermaid source preflight and generated-SVG resource filtering so diagrams cannot bypass the remote-image preference.
- Added atomic settings writes with temporary-file flushing, last-known-good backups, corrupt-file preservation, and backup recovery.
- Added native frameless-window edge and corner resize handles using Tauri's window resize API.
- Added regression coverage and security documentation for the Markdown, raw HTML, image, Mermaid, and link sandbox.

### Changed
- Rendered Markdown links are intercepted before the embedded webview can navigate.
- Protocol-relative remote image URLs are normalized to HTTPS only after the user enables Remote Images.
- Settings finish loading before frontend persistence begins, preventing default startup state from overwriting saved preferences.
- Application-level scrolling is constrained to the source and preview panes so the title bar, tabs, toolbar, and status area remain stable.
- Redesigned document tabs as compact, theme-aware editor tabs while preserving keyboard, ARIA, close, dirty-state, and reorder behavior.
- The settings drawer now owns its vertical scrolling and remains usable at the minimum window height.
- The displayed application version comes from the installed Tauri application metadata, and updater responses are checked with semantic-version ordering before installation.
- Removed transformed workspace-layer behavior that could interfere with desktop text rendering and pane layout.

### Fixed
- Fixed issue #4, where opening a Markdown file could automatically request a remote tracking image.
- Fixed Mermaid-generated SVG and external image nodes as a bypass around ordinary Markdown image filtering.
- Fixed external links falling through to in-app webview navigation paths instead of a native confirmation flow.
- Fixed issue #5, where an interrupted settings write could corrupt `settings.json` and silently reset preferences.
- Fixed startup settings hydration racing with the first automatic settings save.
- Fixed long documents causing the full webview page to scroll instead of the intended editor or reader pane.
- Fixed a Marked inline-token crash caused by manually reparsing nested link tokens, including valid codespans in links.
- Stabilized manual frameless title-bar drag and maximize/restore handling by removing competing drag-region behavior.
- Added release-version and updater-manifest validation so package, native, tag, and published updater versions cannot silently diverge.

## [1.2.3]

_Released: 2026-07-08_

### Added
- Added a signed Tauri updater flow in Settings that checks the latest public GitHub Release, installs a newer release when available, and reports when mdview is already current.
- Added in-window Markdown tabs so multiple local Markdown files and drafts can stay open at the same time.
- Added updater release metadata generation for `latest.json` plus signed updater artifacts in GitHub Actions.

### Changed
- Open-file, drag-and-drop, and file-association opens now create or focus document tabs instead of replacing a dirty document.
- Tightened the release workflow triggers to `main`, PR validation, version tags, and manual dispatch while preserving Linux, Windows, and macOS bundle outputs.

## [1.2.2]

_Released: 2026-07-07_

### Added
- **Three Premium Themes**:
  - `Nordic`: Frost-inspired cool dark theme with a clean slate canvas and ice-blue highlights.
  - `Velvet`: Royal dark purple theme featuring a deep plum canvas and rich violet highlights.
  - `Crimson`: Elegant burgundy theme featuring a dark cherry canvas and rose-red highlights.
- **Visual Theme Swatches**: Integrated dual-tone gradient preview swatches into the Settings theme selector and Toolbar dropdown, representing each theme's canvas and accent combination.

### Changed
- **Landing Page**: Redesigned the default empty state into a polished landing dashboard with a file/sparkles logo badge, dual action cards, and a feature overview.
- **Custom Theme Dropdown**: Replaced the native browser dropdown with a custom theme switcher featuring theme swatches and click-outside dismissal.
- **Settings Drawer**: Upgraded editor preferences with interactive sliding toggles.
- **Theme Color Refinements**: Retuned Graphite, Quartz, Paper, Midnight, and Sage for improved contrast and consistency.
- **Recent Files Grid**: Redesigned recent-file entries as rounded cards with icons and hover feedback.
