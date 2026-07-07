# Changelog

All notable changes to this project will be documented in this file.

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
  - `Crimson`: Elegant burgundy theme with a dark cherry canvas and rose-red highlights.
- **Visual Theme Swatches**: Integrated dual-tone gradient preview swatches to both the Settings theme selector and the Toolbar dropdown, representing the canvas and accent color combination for each theme.

### Changed
- **Stunning Landing Page**: Redesigned the default empty state into a high-fidelity landing page dashboard. Features a glowing file/sparkles logo badge, clean typography, dual hover-elevated cards for opening files and creating drafts, and an aligned bottom features showcase.
- **Custom Theme Dropdown**: Replaced the native browser dropdown menu with a custom theme switcher component featuring smooth CSS animations, custom theme swatches, and click-outside dismissal.
- **Polished Settings Drawer**: Upgraded the settings section with premium interactive iOS-style sliding switch toggles for editor preferences like Sync Scroll.
- **Theme Color Refinements**: Retuned the color variables of existing themes (Graphite, Quartz, Paper, Midnight, Sage) for deeper contrast, modern harmony, and visual excellence.
- **Rounded Recent Files Grid**: Redesigned the recent files listing as a clean, rounded grid containing file icons, metadata, and smooth hover elevations.
