#!/usr/bin/env bash
set -Eeuo pipefail

APP_NAME="mdview"
INSTALL_ROOT="${XDG_DATA_HOME:-$HOME/.local/share}"
APP_INSTALL_DIR="$INSTALL_ROOT/$APP_NAME"
APPLICATIONS_DIR="$INSTALL_ROOT/applications"
ICONS_DIR="$INSTALL_ROOT/icons/hicolor"

log() {
    printf '[%s] %s\n' "$APP_NAME" "$*"
}

remove_if_exists() {
    local path="$1"
    if [[ -e "$path" ]]; then
        rm -rf "$path"
        log "Removed $path"
    fi
}

main() {
    remove_if_exists "$APP_INSTALL_DIR"
    remove_if_exists "$APPLICATIONS_DIR/$APP_NAME.desktop"
    remove_if_exists "$ICONS_DIR/64x64/apps/$APP_NAME.png"
    remove_if_exists "$ICONS_DIR/128x128/apps/$APP_NAME.png"
    remove_if_exists "$ICONS_DIR/256x256/apps/$APP_NAME.png"
    remove_if_exists "$ICONS_DIR/scalable/apps/$APP_NAME.svg"

    if command -v update-desktop-database >/dev/null 2>&1; then
        update-desktop-database "$APPLICATIONS_DIR" || true
    fi

    if command -v gtk-update-icon-cache >/dev/null 2>&1; then
        gtk-update-icon-cache "$ICONS_DIR" || true
    fi

    log "Uninstall complete."
}

main "$@"
