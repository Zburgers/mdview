#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

export APPIMAGE_EXTRACT_AND_RUN="${APPIMAGE_EXTRACT_AND_RUN:-1}"
export NO_STRIP="${NO_STRIP:-1}"

require_commands() {
  local missing=()
  local cmd

  for cmd in "$@"; do
    if ! command -v "$cmd" >/dev/null 2>&1; then
      missing+=("$cmd")
    fi
  done

  if (( ${#missing[@]} > 0 )); then
    printf 'Missing required command(s): %s\n' "${missing[*]}" >&2
    printf 'Install the Linux packaging dependencies before running this script.\n' >&2
    exit 127
  fi
}

require_commands \
  appstreamcli \
  node \
  pnpm \
  python3 \
  rpmbuild

version="$(node -e "console.log(JSON.parse(require('fs').readFileSync('package.json', 'utf8')).version)")"

deb_path="src-tauri/target/release/bundle/deb/mdview_${version}_amd64.deb"
rpm_path="src-tauri/target/release/bundle/rpm/mdview-${version}-1.x86_64.rpm"
appimage_path="src-tauri/target/release/bundle/appimage/mdview_${version}_amd64.AppImage"

rm -rf src-tauri/target/release/bundle/deb \
  src-tauri/target/release/bundle/rpm \
  src-tauri/target/release/bundle/appimage

set +e
pnpm tauri build --bundles deb,rpm,appimage --verbose
tauri_status=$?
set -e

if [[ "$tauri_status" -eq 0 ]]; then
  for artifact in "$deb_path" "$rpm_path" "$appimage_path"; do
    [[ -f "$artifact" ]] || {
      echo "Expected artifact was not created: $artifact" >&2
      exit 1
    }
  done
  exit 0
fi

echo "Tauri AppImage bundling failed; attempting AppDir metadata repair fallback." >&2

appdir="src-tauri/target/release/bundle/appimage/mdview.AppDir"
desktop_old="$appdir/usr/share/applications/mdview.desktop"
desktop_new="$appdir/usr/share/applications/dev.zburgers.mdview.desktop"
appdata="$appdir/usr/share/metainfo/dev.zburgers.mdview.appdata.xml"

if [[ ! -d "$appdir" ]]; then
  echo "AppImage AppDir was not created by tauri build." >&2
  exit 1
fi

if [[ -f "$desktop_old" ]]; then
  mv "$desktop_old" "$desktop_new"
fi

python3 - <<'PY'
from pathlib import Path
import re

appdir = Path("src-tauri/target/release/bundle/appimage/mdview.AppDir")
desktop = appdir / "usr/share/applications/dev.zburgers.mdview.desktop"
appdata = appdir / "usr/share/metainfo/dev.zburgers.mdview.appdata.xml"

if not desktop.exists():
    raise SystemExit(f"Missing desktop file: {desktop}")
if not appdata.exists():
    raise SystemExit(f"Missing AppStream metadata: {appdata}")

desktop_text = desktop.read_text()
desktop_text = re.sub(r"^StartupWMClass=.*$", "StartupWMClass=dev.zburgers.mdview", desktop_text, flags=re.M)
desktop.write_text(desktop_text)

appdata_text = appdata.read_text()
appdata_text = re.sub(
    r"<id>.*?</id>",
    "<id>dev.zburgers.mdview.desktop</id>",
    appdata_text,
    count=1,
)
appdata_text = re.sub(
    r'<launchable type="desktop-id">.*?</launchable>',
    '<launchable type="desktop-id">dev.zburgers.mdview.desktop</launchable>',
    appdata_text,
    count=1,
)
appdata.write_text(appdata_text)

for stale_path in appdir.glob("usr/share/metainfo/*.appdata.xml"):
    if stale_path != appdata:
        stale_path.unlink()

for link_name in ("mdview.desktop", "dev.zburgers.mdview.desktop"):
    link_path = appdir / link_name
    if link_path.exists() or link_path.is_symlink():
        link_path.unlink()

(appdir / "dev.zburgers.mdview.desktop").symlink_to(
    Path("usr/share/applications/dev.zburgers.mdview.desktop")
)
PY

appstreamcli validate "$appdata" >/dev/null

tool_root="${TMPDIR:-/tmp}/mdview-appimagetool"
rm -rf "$tool_root"
mkdir -p "$tool_root"

(
  cd "$tool_root"
  APPIMAGE_EXTRACT_AND_RUN=1 ~/.cache/tauri/linuxdeploy-plugin-appimage.AppImage --appimage-extract >/dev/null
)

rm -f "$appimage_path"

ARCH=x86_64 "$tool_root/squashfs-root/usr/bin/appimagetool" "$appdir" "$appimage_path"

for artifact in "$deb_path" "$rpm_path" "$appimage_path"; do
  [[ -f "$artifact" ]] || {
    echo "Expected artifact was not created: $artifact" >&2
    exit 1
  }
done
