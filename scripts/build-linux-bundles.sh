#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

export APPIMAGE_EXTRACT_AND_RUN="${APPIMAGE_EXTRACT_AND_RUN:-1}"
export NO_STRIP="${NO_STRIP:-1}"

version="$(node -e "console.log(JSON.parse(require('fs').readFileSync('package.json', 'utf8')).version)")"

patch_desktop_file() {
  local desktop_file="$1"
  python3 - "$desktop_file" <<'PY'
from pathlib import Path
import re
import sys

desktop = Path(sys.argv[1])
text = desktop.read_text()

replacements = {
    "StartupWMClass": "dev.zburgers.mdview",
    "Icon": "mdview",
    "StartupNotify": "true",
    "Terminal": "false",
    "Type": "Application",
}

for key, value in replacements.items():
    line = f"{key}={value}"
    if re.search(rf"^{re.escape(key)}=.*$", text, flags=re.M):
        text = re.sub(rf"^{re.escape(key)}=.*$", line, text, flags=re.M)
    else:
        text = text.rstrip() + "\n" + line + "\n"

if not re.search(r"^Exec=.*%[fFuU].*$", text, flags=re.M):
    text = re.sub(r"^Exec=(.*)$", r"Exec=\1 %U", text, flags=re.M)

if not re.search(r"^MimeType=.*text/markdown.*$", text, flags=re.M):
    text = text.rstrip() + "\nMimeType=text/markdown;text/plain;\n"

desktop.write_text(text)
PY
}

patch_deb_bundle() {
  local deb_path="src-tauri/target/release/bundle/deb/mdview_${version}_amd64.deb"
  local work_dir
  work_dir="$(mktemp -d)"
  trap 'rm -rf "$work_dir"' RETURN

  dpkg-deb -R "$deb_path" "$work_dir/package"

  local desktop_dir="$work_dir/package/usr/share/applications"
  mv "$desktop_dir/mdview.desktop" "$desktop_dir/dev.zburgers.mdview.desktop"
  patch_desktop_file "$desktop_dir/dev.zburgers.mdview.desktop"

  (
    cd "$work_dir/package"
    find usr -type f -exec md5sum {} + | sort -k 2 > DEBIAN/md5sums
  )

  desktop-file-validate "$desktop_dir/dev.zburgers.mdview.desktop"
  appstreamcli validate "$work_dir/package/usr/share/metainfo/dev.zburgers.mdview.appdata.xml" >/dev/null
  dpkg-deb --root-owner-group -b "$work_dir/package" "$deb_path"
}

patch_rpm_bundle() {
  local rpm_path="src-tauri/target/release/bundle/rpm/mdview-${version}-1.x86_64.rpm"
  local work_dir
  work_dir="$(mktemp -d)"
  trap 'rm -rf "$work_dir"' RETURN

  mkdir -p "$work_dir/root"
  (
    cd "$work_dir/root"
    rpm2cpio "$repo_root/$rpm_path" | cpio -idm --quiet
  )

  local desktop_dir="$work_dir/root/usr/share/applications"
  mv "$desktop_dir/mdview.desktop" "$desktop_dir/dev.zburgers.mdview.desktop"
  patch_desktop_file "$desktop_dir/dev.zburgers.mdview.desktop"

  desktop-file-validate "$desktop_dir/dev.zburgers.mdview.desktop"
  appstreamcli validate "$work_dir/root/usr/share/metainfo/dev.zburgers.mdview.appdata.xml" >/dev/null

  mkdir -p "$work_dir/rpmbuild/BUILD" "$work_dir/rpmbuild/BUILDROOT" "$work_dir/rpmbuild/RPMS" "$work_dir/rpmbuild/SOURCES" "$work_dir/rpmbuild/SPECS" "$work_dir/rpmbuild/SRPMS"

  cat > "$work_dir/rpmbuild/SPECS/mdview.spec" <<EOF
Name: mdview
Version: ${version}
Release: 1
Summary: Tiny local Markdown reader
License: MIT
URL: https://github.com/Zburgers/mdview
BuildArch: x86_64
Requires: libgtk-3.so.0()(64bit)
Requires: libwebkit2gtk-4.1.so.0()(64bit)
AutoReqProv: no

%description
A tiny, fast, local-first Markdown reader with split source mode, Mermaid support, and print-friendly output.

%install
rm -rf %{buildroot}
mkdir -p %{buildroot}
cp -a ${work_dir}/root/. %{buildroot}/

%files
%attr(0755,root,root) /usr/bin/mdview
%attr(0644,root,root) /usr/share/applications/dev.zburgers.mdview.desktop
%attr(0644,root,root) /usr/share/icons/hicolor/64x64/apps/mdview.png
%attr(0644,root,root) /usr/share/icons/hicolor/128x128/apps/mdview.png
%attr(0644,root,root) /usr/share/icons/hicolor/256x256/apps/mdview.png
%attr(0644,root,root) /usr/share/metainfo/dev.zburgers.mdview.appdata.xml
EOF

  rpmbuild --define "_topdir $work_dir/rpmbuild" -bb "$work_dir/rpmbuild/SPECS/mdview.spec" >/dev/null 2>&1
  cp "$work_dir/rpmbuild/RPMS/x86_64/mdview-${version}-1.x86_64.rpm" "$rpm_path"
}

pnpm tauri build --bundles deb,rpm
patch_deb_bundle
patch_rpm_bundle

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

output="src-tauri/target/release/bundle/appimage/mdview_${version}_amd64.AppImage"
rm -f "$output"

ARCH=x86_64 "$tool_root/squashfs-root/usr/bin/appimagetool" "$appdir" "$output"
