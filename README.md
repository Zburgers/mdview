# mdview

`mdview` is a lightweight, native GTK Markdown editor with live preview.

It is designed to feel minimal and fast while staying easy to extend.

## Highlights

- Native GTK 4 application (no Electron)
- Split editor/preview layout with draggable divider
- Live rendering using Python-Markdown
- Dark mode toggle for preview
- Copy rendered HTML to clipboard
- Local install script for desktop launcher + icons

## Screenshot

Add a screenshot here after publishing:

```text
docs/screenshot.png
```

## Tech Stack

- Python 3
- PyGObject (`Gtk`, `Gdk`, `GLib`)
- WebKitGTK (`WebKit` introspection)
- Python-Markdown

## Requirements (Fedora)

System packages:

```bash
sudo dnf install -y python3-gobject gtk4 webkit2gtk4.1 python3-pip
```

Python package:

```bash
python3 -m pip install --user markdown
```

## Run From Source

```bash
python3 markdown_editor.py
```

## Install (Desktop Integration)

Install for the current user (recommended):

```bash
./install.sh
```

What it installs:

- App code: `~/.local/share/mdview/markdown_editor.py`
- Desktop file: `~/.local/share/applications/mdview.desktop`
- Icons: `~/.local/share/icons/hicolor/.../mdview.*`

After install, launch **mdview** from your Applications menu.

### Installer options

Skip dependency installation:

```bash
./install.sh --no-deps
```

## Uninstall

```bash
./uninstall.sh
```

## Project Layout

- `markdown_editor.py` - main GTK app
- `install.sh` - user-local installer
- `uninstall.sh` - remove installed files
- `icons/hicolor/` - app icon assets
- `mdview.desktop` - development desktop entry template

## Roadmap

- Export to PDF
- Optional synced scrolling
- Save/open markdown files
- Packaging for RPM/Flatpak

## License

MIT (or your preferred license)
