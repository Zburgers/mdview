#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
APP_NAME="mdview"
APP_LABEL="mdview"

INSTALL_ROOT="${XDG_DATA_HOME:-$HOME/.local/share}"
APP_INSTALL_DIR="$INSTALL_ROOT/$APP_NAME"
APPLICATIONS_DIR="$INSTALL_ROOT/applications"
ICONS_DIR="$INSTALL_ROOT/icons/hicolor"
INSTALL_DEPS=true

log() {
    printf '[%s] %s\n' "$APP_NAME" "$*"
}

require_cmd() {
    local cmd="$1"
    if ! command -v "$cmd" >/dev/null 2>&1; then
        printf '[%s] ERROR: missing command: %s\n' "$APP_NAME" "$cmd" >&2
        exit 1
    fi
}

copy_icon_size() {
    local size="$1"
    local src="$SCRIPT_DIR/icons/hicolor/${size}/apps/$APP_NAME.png"
    local dst_dir="$ICONS_DIR/${size}/apps"

    mkdir -p "$dst_dir"
    install -m 0644 "$src" "$dst_dir/$APP_NAME.png"
}

install_system_deps() {
    if [[ "$INSTALL_DEPS" != "true" ]]; then
        return 0
    fi

    local -a deps

    if command -v dnf >/dev/null 2>&1; then
        deps=(python3-gobject gtk4 webkit2gtk4.1)
        log "Detected dnf (Fedora/RHEL family)"
        if command -v sudo >/dev/null 2>&1; then
            log "Installing system dependencies via dnf"
            sudo dnf install -y "${deps[@]}"
        else
            log "sudo not found; skipping system package install"
        fi
        return 0
    elif command -v apt-get >/dev/null 2>&1; then
        local webkit_pkg=""
        deps=(python3-gi gir1.2-gtk-4.0)

        if apt-cache show gir1.2-webkit-6.0 >/dev/null 2>&1; then
            webkit_pkg="gir1.2-webkit-6.0"
        elif apt-cache show gir1.2-webkit2-4.1 >/dev/null 2>&1; then
            webkit_pkg="gir1.2-webkit2-4.1"
        fi

        if [[ -n "$webkit_pkg" ]]; then
            deps+=("$webkit_pkg")
        else
            log "Could not detect a WebKitGTK introspection package via apt; install it manually"
        fi

        log "Detected apt-get (Debian/Ubuntu family)"
        if command -v sudo >/dev/null 2>&1; then
            log "Installing system dependencies via apt-get"
            sudo apt-get update
            sudo apt-get install -y "${deps[@]}"
        else
            log "sudo not found; skipping system package install"
        fi
        return 0
    elif command -v pacman >/dev/null 2>&1; then
        deps=(python-gobject gtk4 webkitgtk-6.0)
        log "Detected pacman (Arch family)"
        if command -v sudo >/dev/null 2>&1; then
            log "Installing system dependencies via pacman"
            sudo pacman -S --needed --noconfirm "${deps[@]}"
        else
            log "sudo not found; skipping system package install"
        fi
        return 0
    elif command -v zypper >/dev/null 2>&1; then
        deps=(python3-gobject-Gdk gtk4 typelib-1_0-WebKit-6_0)
        log "Detected zypper (openSUSE family)"
        if command -v sudo >/dev/null 2>&1; then
            log "Installing system dependencies via zypper"
            sudo zypper --non-interactive install "${deps[@]}"
        else
            log "sudo not found; skipping system package install"
        fi
        return 0
    else
        log "No supported package manager detected; skipping system package install"
        log "Install dependencies manually: GTK4 + WebKitGTK + PyGObject introspection"
        return 0
    fi
}

install_python_deps() {
    if [[ "$INSTALL_DEPS" != "true" ]]; then
        return 0
    fi

    if python3 -c "import mistune" >/dev/null 2>&1; then
        log "Python dependency already available: mistune"
        return 0
    fi

    log "Installing Python dependency: mistune"
    if python3 -m pip install --user --upgrade mistune; then
        return 0
    fi

    log "pip install failed (likely PEP 668 externally managed environment)"
    log "Retrying with --break-system-packages in user site-packages"
    python3 -m pip install --user --break-system-packages --upgrade mistune
}

parse_args() {
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --no-deps)
                INSTALL_DEPS=false
                shift
                ;;
            -h|--help)
                cat <<EOF
Usage: ./install.sh [--no-deps]

Options:
  --no-deps   Skip dependency installation
  -h, --help  Show this help text
EOF
                exit 0
                ;;
            *)
                printf '[%s] ERROR: unknown argument: %s\n' "$APP_NAME" "$1" >&2
                exit 1
                ;;
        esac
    done
}

main() {
    parse_args "$@"

    require_cmd python3
    require_cmd install

    install_system_deps
    install_python_deps

    if [[ -d "$APP_INSTALL_DIR" || -f "$APPLICATIONS_DIR/$APP_NAME.desktop" ]]; then
        log "Existing installation detected. Updating in place."
    else
        log "No existing installation found. Performing fresh install."
    fi

    mkdir -p "$APP_INSTALL_DIR" "$APPLICATIONS_DIR"

    log "Installing application files to $APP_INSTALL_DIR"
    install -m 0755 "$SCRIPT_DIR/markdown_editor.py" "$APP_INSTALL_DIR/markdown_editor.py"
    install -m 0644 "$SCRIPT_DIR/mdview_utils.py" "$APP_INSTALL_DIR/mdview_utils.py"
    mkdir -p "$APP_INSTALL_DIR/assets/vendor"
    install -m 0644 "$SCRIPT_DIR/assets/vendor/mermaid.min.js" "$APP_INSTALL_DIR/assets/vendor/mermaid.min.js"

    log "Installing icons"
    copy_icon_size "64x64"
    copy_icon_size "128x128"
    copy_icon_size "256x256"
    mkdir -p "$ICONS_DIR/scalable/apps"
    install -m 0644 "$SCRIPT_DIR/icons/hicolor/scalable/apps/$APP_NAME.svg" "$ICONS_DIR/scalable/apps/$APP_NAME.svg"

    if [[ -f "$SCRIPT_DIR/icons/hicolor/index.theme" ]]; then
        mkdir -p "$ICONS_DIR"
        install -m 0644 "$SCRIPT_DIR/icons/hicolor/index.theme" "$ICONS_DIR/index.theme"
    fi

    local desktop_file="$APPLICATIONS_DIR/$APP_NAME.desktop"

    log "Writing desktop entry to $desktop_file"
    cat > "$desktop_file" <<EOF
[Desktop Entry]
Type=Application
Version=1.0
Name=$APP_LABEL
Comment=Lightweight GTK Markdown editor with live preview
Exec=python3 $APP_INSTALL_DIR/markdown_editor.py
Icon=$APP_NAME
Terminal=false
Categories=Utility;TextEditor;
StartupNotify=true
StartupWMClass=dev.example.MarkdownPreview
EOF

    if command -v update-desktop-database >/dev/null 2>&1; then
        update-desktop-database "$APPLICATIONS_DIR" || true
    fi

    if command -v gtk-update-icon-cache >/dev/null 2>&1; then
        gtk-update-icon-cache "$ICONS_DIR" || true
    fi

    log "Install complete. You can launch '$APP_LABEL' from Applications."
}

main "$@"
