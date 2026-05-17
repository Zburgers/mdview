# mdview

`mdview` is a tiny, fast, local-first Markdown reader for developers, students,
technical teams, and AI-agent workflows.

v2 is being rebuilt as a Tauri v2 desktop app for Linux, Windows, and macOS. The
goal is clean Markdown viewing, optional source/split workflows, Mermaid support,
and print-friendly PDF output without Electron or unsafe shell-script
installation.

## Current Status

The Tauri v2 foundation is implemented on the `tauri-v2` branch.

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
- Print stylesheet for system print-to-PDF.
- Tauri Linux `.deb` and `.rpm` bundle validation.
- GitHub Actions foundation for Linux, Windows, and macOS release artifacts.

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

## Packaging

Build the Tauri app:

```bash
pnpm tauri build
```

Build Linux `.deb` and `.rpm` locally:

```bash
pnpm tauri build --bundles deb,rpm
```

Linux AppImage is configured, but local AppImage generation can be host-sensitive.
On the Fedora validation host, `linuxdeploy` failed while stripping libraries
containing `.relr.dyn` sections. Ubuntu GitHub Actions is the intended first
AppImage build path.

Windows NSIS and macOS `.app`/`.dmg` builds are configured for native CI runners.

## Supported Platforms

Target platforms:

- Linux
- Windows
- macOS

Current local validation has produced Linux `.deb` and `.rpm` artifacts. Windows
and macOS packaging should be validated by GitHub Actions on their native runners.

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
- v1.0: hardened local image policy, file associations, signed artifacts where
  practical, public release documentation.

## Known Limitations

- Raw HTML is not trusted by default.
- Local images are scoped to opened-document workflows and still need additional
  hardening before a public release.
- AppImage bundling should be validated in Ubuntu CI.
- Windows and macOS installers need CI validation on native runners.

## License

MIT
