#!/usr/bin/env bash
set -Eeuo pipefail

APP_NAME="mdview"
DRY_RUN=false
VERSION=""

log() {
    printf '[%s release] %s\n' "$APP_NAME" "$*"
}

fail() {
    printf '[%s release] ERROR: %s\n' "$APP_NAME" "$*" >&2
    exit 1
}

run_cmd() {
    if [[ "$DRY_RUN" == "true" ]]; then
        printf '[dry-run] %s\n' "$*"
        return 0
    fi

    "$@"
}

usage() {
    cat <<EOF
Usage: ./release.sh --version vX.Y.Z [--dry-run]

Creates and pushes an annotated version tag. GitHub Actions builds the native
Tauri installers on Linux, Windows, and macOS, then publishes them to the GitHub
Release created for the tag.

Options:
  --version vX.Y.Z  Release version tag. Must match package and Tauri metadata.
  --dry-run         Print planned actions without executing.
  -h, --help        Show this help.

Example:
  ./release.sh --version v1.0.0
EOF
}

parse_args() {
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --version)
                [[ $# -ge 2 ]] || fail "--version requires a value"
                VERSION="$2"
                shift 2
                ;;
            --dry-run)
                DRY_RUN=true
                shift
                ;;
            -h|--help)
                usage
                exit 0
                ;;
            *)
                fail "Unknown argument: $1"
                ;;
        esac
    done
}

require_cmd() {
    local cmd="$1"
    command -v "$cmd" >/dev/null 2>&1 || fail "Missing command: $cmd"
}

require_clean_git() {
    local status
    status="$(git status --porcelain)"
    [[ -z "$status" ]] || fail "Working tree is not clean. Commit or stash changes first."
}

validate_version() {
    local tag="$1"
    [[ "$tag" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]] || fail "Invalid version '$tag' (expected vX.Y.Z)"
}

json_version() {
    local path="$1"
    node -e "console.log(JSON.parse(require('fs').readFileSync(process.argv[1], 'utf8')).version)" "$path"
}

toml_version() {
    local path="$1"
    sed -n 's/^version = "\(.*\)"/\1/p' "$path" | head -n 1
}

require_matching_versions() {
    local version_without_v="${VERSION#v}"
    local package_version
    local tauri_version
    local cargo_version

    package_version="$(json_version package.json)"
    tauri_version="$(json_version src-tauri/tauri.conf.json)"
    cargo_version="$(toml_version src-tauri/Cargo.toml)"

    [[ "$package_version" == "$version_without_v" ]] || fail "package.json is $package_version, expected $version_without_v"
    [[ "$tauri_version" == "$version_without_v" ]] || fail "src-tauri/tauri.conf.json is $tauri_version, expected $version_without_v"
    [[ "$cargo_version" == "$version_without_v" ]] || fail "src-tauri/Cargo.toml is $cargo_version, expected $version_without_v"
}

main() {
    parse_args "$@"

    [[ -n "$VERSION" ]] || fail "--version is required"
    validate_version "$VERSION"

    require_cmd git
    require_cmd node

    git rev-parse --is-inside-work-tree >/dev/null 2>&1 || fail "Not inside a git repository"

    require_clean_git
    require_matching_versions

    if git rev-parse "$VERSION" >/dev/null 2>&1; then
        fail "Tag already exists locally: $VERSION"
    fi

    if git ls-remote --exit-code --tags origin "refs/tags/$VERSION" >/dev/null 2>&1; then
        fail "Tag already exists on origin: $VERSION"
    fi

    log "Creating release tag $VERSION"
    run_cmd git tag -a "$VERSION" -m "Release $VERSION"
    run_cmd git push origin "$VERSION"
    log "Pushed $VERSION. GitHub Actions will publish installer assets to the release."
}

main "$@"
