#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

export APPIMAGE_EXTRACT_AND_RUN="${APPIMAGE_EXTRACT_AND_RUN:-1}"
export NO_STRIP="${NO_STRIP:-1}"

pnpm tauri build --bundles deb,rpm

rm -rf src-tauri/target/release/bundle/appimage

if pnpm tauri build --bundles appimage --verbose; then
  exit 0
fi

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

version="$(node -e "console.log(JSON.parse(require('fs').readFileSync('package.json', 'utf8')).version)")"
output="src-tauri/target/release/bundle/appimage/mdview_${version}_amd64.AppImage"
rm -f "$output"

ARCH=x86_64 "$tool_root/squashfs-root/usr/bin/appimagetool" "$appdir" "$output"
