# Packaging and Release

Release artifacts are built through Tauri v2.

Planned targets:

- Linux: AppImage, `.deb`, `.rpm`.
- Windows: NSIS installer.
- macOS: `.app` bundle and `.dmg`.

GitHub Actions runs validation first, then bundles on native runners:

- Ubuntu builds Linux artifacts.
- Windows builds NSIS.
- macOS builds `.app` and `.dmg`.

Artifact names should include `mdview`, version, platform, architecture, and
bundle type.
