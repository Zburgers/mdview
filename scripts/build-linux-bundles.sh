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

require_commands node pnpm

version="$(node -e "console.log(JSON.parse(require('fs').readFileSync('package.json', 'utf8')).version)")"

deb_path="src-tauri/target/release/bundle/deb/mdview_${version}_amd64.deb"
rpm_path="src-tauri/target/release/bundle/rpm/mdview-${version}-1.x86_64.rpm"
appimage_path="src-tauri/target/release/bundle/appimage/mdview_${version}_amd64.AppImage"

rm -rf \
  src-tauri/target/release/bundle/deb \
  src-tauri/target/release/bundle/rpm \
  src-tauri/target/release/bundle/appimage

pnpm tauri build --bundles appimage,deb,rpm --verbose

for artifact in "$deb_path" "$rpm_path" "$appimage_path"; do
  if [[ ! -f "$artifact" ]]; then
    echo "Expected Linux release artifact was not created: $artifact" >&2
    exit 1
  fi
done

echo "Built Linux release artifacts:"
printf '  %s\n' "$deb_path" "$rpm_path" "$appimage_path"
