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
  cpio \
  dpkg-deb \
  node \
  pnpm \
  python3 \
  rpm2cpio \
  rpmbuild

version="$(node -e "console.log(JSON.parse(require('fs').readFileSync('package.json', 'utf8')).version)")"

deb_path="src-tauri/target/release/bundle/deb/mdview_${version}_amd64.deb"
rpm_path="src-tauri/target/release/bundle/rpm/mdview-${version}-1.x86_64.rpm"
appimage_path="src-tauri/target/release/bundle/appimage/mdview_${version}_amd64.AppImage"

artifacts_present() {
  local artifact

  for artifact in "$deb_path" "$rpm_path" "$appimage_path"; do
    [[ -f "$artifact" ]] || return 1
  done
}

verify_artifacts() {
  local artifact

  for artifact in "$deb_path" "$rpm_path" "$appimage_path"; do
    [[ -f "$artifact" ]] || {
      echo "Expected artifact was not created: $artifact" >&2
      exit 1
    }
  done
}

validate_appstream_nonfatal() {
  local appdata="$1"

  if ! appstreamcli validate "$appdata"; then
    echo "Warning: AppStream validation reported issues for $appdata; continuing because release artifacts were still created." >&2
  fi
}

repair_linux_metadata_root() {
  local root="$1"
  local desktop_old="$root/usr/share/applications/mdview.desktop"
  local desktop_new="$root/usr/share/applications/dev.zburgers.mdview.desktop"
  local appdata="$root/usr/share/metainfo/dev.zburgers.mdview.appdata.xml"

  if [[ -f "$desktop_old" ]]; then
    mv "$desktop_old" "$desktop_new"
  fi

  python3 - "$root" <<'PY'
from pathlib import Path
import re
import sys

root = Path(sys.argv[1])
desktop = root / "usr/share/applications/dev.zburgers.mdview.desktop"
appdata = root / "usr/share/metainfo/dev.zburgers.mdview.appdata.xml"

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

for stale_path in (root / "usr/share/metainfo").glob("*.appdata.xml"):
    if stale_path != appdata:
        stale_path.unlink()
PY

  chmod 0755 "$root/usr/bin/mdview"
  chmod 0644 "$desktop_new" "$appdata"
  find "$root/usr/share/icons" -type f -exec chmod 0644 {} +
  validate_appstream_nonfatal "$appdata"
}

repair_deb_package() {
  local deb_dir="src-tauri/target/release/bundle/deb/mdview_${version}_amd64"
  local package_root

  [[ -d "$deb_dir/data" && -d "$deb_dir/control" ]] || return 0

  repair_linux_metadata_root "$deb_dir/data"

  package_root="$(mktemp -d)"
  mkdir -p "$package_root/DEBIAN"
  cp -a "$deb_dir/data/." "$package_root/"
  cp -a "$deb_dir/control/." "$package_root/DEBIAN/"

  (
    cd "$package_root"
    find . -type f ! -path './DEBIAN/*' -printf '%P\0' \
      | sort -z \
      | xargs -0 md5sum > DEBIAN/md5sums
  )

  dpkg-deb --build "$package_root" "$deb_path" >/dev/null
  rm -rf "$package_root"
}

repair_rpm_package() {
  local rpm_root
  local workdir spec

  [[ -f "$rpm_path" ]] || return 0

  rpm_root="$(mktemp -d)"
  (
    cd "$rpm_root"
    rpm2cpio "$repo_root/$rpm_path" | cpio -id --quiet
  )

  repair_linux_metadata_root "$rpm_root"

  workdir="$(mktemp -d)"
  mkdir -p "$workdir"/{BUILD,BUILDROOT,RPMS,SOURCES,SPECS,SRPMS}
  spec="$workdir/SPECS/mdview.spec"

  cat > "$spec" <<EOF
Name: mdview
Version: $version
Release: 1
Summary: Tiny local Markdown reader
License: MIT
URL: https://github.com/Zburgers/mdview
BuildArch: x86_64

%description
A tiny, fast, local-first Markdown reader with split source mode, Mermaid support, and print-friendly output.

%install
mkdir -p %{buildroot}
cp -a $rpm_root/. %{buildroot}/

%files
/usr/bin/mdview
/usr/share/applications/dev.zburgers.mdview.desktop
/usr/share/icons/hicolor/64x64/apps/mdview.png
/usr/share/icons/hicolor/128x128/apps/mdview.png
/usr/share/icons/hicolor/256x256/apps/mdview.png
/usr/share/metainfo/dev.zburgers.mdview.appdata.xml
EOF

  rpmbuild --define "_topdir $workdir" -bb "$spec" >/dev/null
  cp "$workdir/RPMS/x86_64/mdview-${version}-1.x86_64.rpm" "$rpm_path"
  rm -rf "$workdir" "$rpm_root"
}

repair_linux_packages() {
  repair_deb_package
  repair_rpm_package
}

repair_linux_packages_nonfatal() {
  if ! repair_linux_packages; then
    echo "Warning: Linux package metadata repair failed after bundles were created; keeping Tauri-generated artifacts." >&2
  fi
}

rm -rf src-tauri/target/release/bundle/deb \
  src-tauri/target/release/bundle/rpm \
  src-tauri/target/release/bundle/appimage

set +e
pnpm tauri build --bundles deb,rpm,appimage --verbose
tauri_status=$?
set -e

if [[ "$tauri_status" -eq 0 ]]; then
  repair_linux_packages_nonfatal
  verify_artifacts
  exit 0
fi

if artifacts_present; then
  echo "Tauri returned exit code $tauri_status after creating all Linux artifacts; keeping the generated bundles." >&2
  repair_linux_packages_nonfatal
  verify_artifacts
  exit 0
fi

echo "Tauri AppImage bundling failed; attempting AppDir metadata repair fallback." >&2
repair_linux_packages_nonfatal

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

validate_appstream_nonfatal "$appdata"

tool_root="${TMPDIR:-/tmp}/mdview-appimagetool"
rm -rf "$tool_root"
mkdir -p "$tool_root"

(
  cd "$tool_root"
  APPIMAGE_EXTRACT_AND_RUN=1 ~/.cache/tauri/linuxdeploy-plugin-appimage.AppImage --appimage-extract >/dev/null
)

rm -f "$appimage_path"

ARCH=x86_64 "$tool_root/squashfs-root/usr/bin/appimagetool" "$appdir" "$appimage_path"

verify_artifacts
