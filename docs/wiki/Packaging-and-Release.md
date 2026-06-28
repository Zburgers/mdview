# Packaging and Release

Release artifacts are built through Tauri v2.

Published targets:

- Linux: AppImage, `.deb`, `.rpm`.
- Windows: NSIS installer.
- macOS: `.app` bundle and `.dmg`.

GitHub Actions runs validation first, then bundles on native runners:

- Ubuntu builds Linux artifacts.
- Windows builds NSIS.
- macOS builds `.app` and `.dmg`.

Branch and pull-request runs upload workflow artifacts for validation. Tags that
match `v*` also publish the installer assets to the GitHub Release.

Local Linux packaging command:

```bash
./scripts/build-linux-bundles.sh
```

Native packaging commands:

```bash
pnpm tauri build --bundles nsis
pnpm tauri build --bundles app,dmg
```

Release command:

```bash
./release.sh --version v1.0.3
```

The release script creates and pushes the annotated tag only. The CI release
workflow builds and attaches the native installers to GitHub.

Windows installers use the embedded WebView2 bootstrapper. File associations are
declared for Markdown and plain text documents in `src-tauri/tauri.conf.json`.
Linux bundles also ship `src-tauri/packaging/linux/dev.zburgers.mdview.appdata.xml`
as AppStream metadata, and `scripts/build-linux-bundles.sh` handles the
generated desktop-entry patch needed for AppImage packaging on the current host.

Artifact names should include `mdview`, version, platform, architecture, and
bundle type.
