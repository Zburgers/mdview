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

Local Linux packaging command:

```bash
./scripts/build-linux-bundles.sh
```

Native packaging commands:

```bash
pnpm tauri build --bundles nsis
pnpm tauri build --bundles app,dmg
```

Windows installers use the embedded WebView2 bootstrapper. File associations are
declared for Markdown and plain text documents in `src-tauri/tauri.conf.json`.
Linux bundles also ship `src-tauri/packaging/linux/dev.zburgers.mdview.appdata.xml`
as AppStream metadata, and `scripts/build-linux-bundles.sh` handles the
generated desktop-entry patch needed for AppImage packaging on the current host.

Artifact names should include `mdview`, version, platform, architecture, and
bundle type.
