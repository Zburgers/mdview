# mdview

`mdview` is a tiny, fast, local-first Markdown reader for developers, students,
technical teams, and AI-agent workflows.

v1 is a Tauri v2 desktop app for Linux, Windows, and macOS. The goal is clean
Markdown viewing, optional source/split workflows, Mermaid support, and
print-friendly PDF output without Electron or unsafe shell-script installation.

## Current Status

The Tauri v2 application is the primary product path for mdview 1.0.

Included now:

- Reader mode as the default experience.
- Split mode and source-only mode.
- Native open/save dialogs.
- Drag-and-drop Markdown file opening.
- GitHub-flavored Markdown rendering.
- Sanitized preview HTML.
- Mermaid fenced block rendering from bundled app assets.
- Light, dark, and system theme preference.
- Recent files persisted locally.
- Search highlighting in the rendered document.
- Sync scrolling in split mode.
- Unsaved-change protection for new/open/recent-file/drag-and-drop/close flows.
- Print stylesheet for system print-to-PDF.
- Tauri Linux `.deb` and `.rpm` bundle validation.
- GitHub Actions release builds for Linux, Windows, and macOS installers.

## Safety Direction

The old shell installer is no longer the preferred install path. Public
distribution should use Tauri-generated bundles and installers.

The v2 app should not mutate system icon themes, desktop themes, icon caches, or
global user environment files. It should not require users to install Python,
Mistune, GTK/WebKitGTK packages, or run `pip --break-system-packages`.

Rendered Markdown is sanitized by default. Raw script, frame, object, embed, and
form content is stripped. External links are intercepted and opened only through
the Tauri opener after user action.

## Development

Prerequisites:

- Node.js 22+
- pnpm 10+
- Rust stable
- Tauri v2 Linux dependencies on Linux

Install dependencies:

```bash
pnpm install
```

Run the desktop app in development:

```bash
pnpm tauri dev
```

Run frontend-only development:

```bash
pnpm dev
```

## Validation

```bash
pnpm test
pnpm typecheck
pnpm build
cd src-tauri
cargo fmt --check
cargo check
cargo clippy -- -D warnings
```

## Install

Download the latest installer from the
[mdview GitHub Releases page](https://github.com/Zburgers/mdview/releases).

Use the asset that matches your operating system:

- Windows: download the NSIS `*-setup.exe`, run it, and follow the installer.
- Linux Debian/Ubuntu: download the `.deb` and install it with `sudo dpkg -i ./mdview*.deb`.
- Linux Fedora/RHEL/openSUSE: download the `.rpm` and install it with `sudo rpm -i ./mdview*.rpm`.
- Linux portable: download the `.AppImage`, run `chmod +x ./mdview*.AppImage`, then launch it.
- macOS: download the `.dmg`, open it, and drag `mdview` to Applications.

Windows installers use the embedded WebView2 bootstrapper. Most Windows systems
already have WebView2; if not, the installer bootstraps it during setup.

## Packaging

Build the Tauri app locally:

```bash
pnpm tauri build
```

Build Linux `.deb` and `.rpm` locally:

```bash
./scripts/build-linux-bundles.sh
```

Windows NSIS and macOS `.app`/`.dmg` builds should be produced on native runners.
Tauri's current guidance is still platform-native packaging for Windows and macOS,
with Linux able to build Linux bundles directly.

## Supported Platforms

Target platforms:

- Linux
- Windows
- macOS

Bundle targets configured in `src-tauri/tauri.conf.json`:

- Linux: AppImage, `.deb`, `.rpm`
- Windows: NSIS installer
- macOS: `.app`, `.dmg`

Current local validation is expected to produce Linux bundles on Linux. Windows
and macOS installers should be validated by GitHub Actions on native runners.

## Install and Test Bundles

### Linux

Build locally:

```bash
pnpm install
./scripts/build-linux-bundles.sh
```

Artifacts are written under `src-tauri/target/release/bundle/`:

- `appimage/*.AppImage`
- `deb/*.deb`
- `rpm/*.rpm`

Install examples:

```bash
sudo dpkg -i src-tauri/target/release/bundle/deb/*.deb
sudo rpm -i src-tauri/target/release/bundle/rpm/*.rpm
chmod +x src-tauri/target/release/bundle/appimage/*.AppImage
./src-tauri/target/release/bundle/appimage/*.AppImage
```

### Windows

Build on Windows:

```powershell
pnpm install
pnpm tauri build --bundles nsis
```

Artifact:

- `src-tauri/target/release/bundle/nsis/*-setup.exe`

The installer is configured to use the embedded WebView2 bootstrapper, which
keeps the bundle size moderate while covering machines that do not already have
WebView2 installed.

### macOS

Build on macOS:

```bash
pnpm install
pnpm tauri build --bundles app,dmg
```

Artifacts:

- `src-tauri/target/release/bundle/macos/*.app`
- `src-tauri/target/release/bundle/dmg/*.dmg`

Unsigned local builds may require opening the app via Finder context menu on the
first launch, or removing quarantine attributes during local testing.

## Release Builds

`.github/workflows/release-build.yml` validates the app on Ubuntu, then builds:

- Linux: AppImage, `.deb`, `.rpm`
- Windows: NSIS
- macOS: `.app`, `.dmg`

The Linux build path uses [`scripts/build-linux-bundles.sh`](scripts/build-linux-bundles.sh),
which first builds `.deb` and `.rpm`, then falls back to a patched AppDir plus
manual `appimagetool` packaging when `linuxdeploy` rejects the generated
desktop entry.

Branch and pull-request runs upload CI artifacts for validation. Version tags
matching `v*` publish the installer assets to a GitHub Release automatically.

Release mdview from a clean, committed tree:

```bash
./release.sh --version v1.0.3
```

The tag push triggers native CI builds and attaches the installers to the GitHub
Release for normal user download.

## Legacy Python GTK App

The original Python GTK/WebKitGTK app remains in the repository as the legacy
reference implementation:

- `markdown_editor.py`
- `mdview_utils.py`
- `install.sh`
- `uninstall.sh`
- `release.sh`
- `assets/vendor/mermaid.min.js`

It provided split editing, live preview, Mermaid rendering, copy HTML, export PDF,
dark preview mode, sync scrolling, and shell-script desktop integration.

That implementation is no longer the preferred public install path because it is
Linux-focused and depends on distro packages, Python packages, and shell scripts
that can affect desktop integration files.

## Project Layout

- `src/` - React/Vite TypeScript frontend.
- `src/lib/` - Markdown, link, and Tauri helper modules.
- `src/components/` - Viewer UI components.
- `src-tauri/` - Tauri v2 Rust backend, configuration, icons, and capabilities.
- `.github/workflows/release-build.yml` - validation and release artifact CI.
- `docs/migration/tauri-v2.md` - migration notes.
- `docs/wiki/` - GitHub Wiki fallback content.
- `markdown_editor.py` and `mdview_utils.py` - legacy Python GTK app.

## Roadmap

- v0.1: viewer foundation, native open/save, recent files, theme persistence.
- v0.2: split/source workflows, sync scroll polish, source editing ergonomics.
- v0.3: export polish, AppImage CI validation, release artifact naming.
- v1.0: Tauri-first public release, native file associations, release installers,
  and public release documentation.

## Known Limitations

- Raw HTML is not trusted by default.
- Local images are scoped to opened-document workflows and still need additional
  hardening before a public release.
- Windows and macOS artifacts are built on native GitHub Actions runners and are
  unsigned by default.

## License

MIT
