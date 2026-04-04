#!/usr/bin/env bash
set -Eeuo pipefail

APP_NAME="mdview"
DEFAULT_BUMP="patch"
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
Usage: ./release.sh [options]

Default behavior:
  - Auto-bump patch version from latest vX.Y.Z tag
  - Verify clean git status and python compile check
  - Create annotated git tag
  - Push tag to origin
  - Create GitHub release with generated notes
  - Upload source tarball asset

Options:
  --version vX.Y.Z  Use explicit version tag instead of auto-bump
  --dry-run         Print planned actions without executing
  -h, --help        Show this help

Examples:
  ./release.sh
  ./release.sh --version v1.3.0
  ./release.sh --dry-run
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
    [[ -z "$status" ]] || fail "Working tree is not clean. Commit/stash changes first."
}

validate_version() {
    local v="$1"
    [[ "$v" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]] || fail "Invalid version '$v' (expected format: vX.Y.Z)"
}

latest_semver_tag() {
    local latest=""
    while IFS= read -r tag; do
        if [[ "$tag" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
            latest="$tag"
        fi
    done < <(git tag --list 'v*' --sort=version:refname)

    printf '%s' "$latest"
}

next_patch_version() {
    local current="$1"
    local major minor patch

    if [[ -z "$current" ]]; then
        printf 'v0.1.0'
        return 0
    fi

    major="${current#v}"
    major="${major%%.*}"

    minor="${current#v$major.}"
    minor="${minor%%.*}"

    patch="${current##*.}"
    patch="$((patch + 1))"

    printf 'v%s.%s.%s' "$major" "$minor" "$patch"
}

create_asset() {
    local version="$1"
    local asset="${APP_NAME}-${version}.tar.gz"

    run_cmd git archive --format=tar.gz --output "$asset" HEAD
    printf '%s' "$asset"
}

main() {
    parse_args "$@"

    require_cmd git
    require_cmd gh
    require_cmd python3

    git rev-parse --is-inside-work-tree >/dev/null 2>&1 || fail "Not inside a git repository"

    log "Running prechecks"
    require_clean_git
    python3 -m py_compile "markdown_editor.py"
    gh auth status >/dev/null

    if [[ -z "$VERSION" ]]; then
        if [[ "$DEFAULT_BUMP" == "patch" ]]; then
            local latest
            latest="$(latest_semver_tag)"
            VERSION="$(next_patch_version "$latest")"
        fi
    fi

    validate_version "$VERSION"

    if git rev-parse "$VERSION" >/dev/null 2>&1; then
        fail "Tag already exists: $VERSION"
    fi

    log "Releasing version $VERSION"

    local asset
    asset="$(create_asset "$VERSION")"

    run_cmd git tag -a "$VERSION" -m "Release $VERSION"
    run_cmd git push origin "$VERSION"

    if [[ "$DRY_RUN" == "true" ]]; then
        printf '[dry-run] gh release create %s %s --generate-notes --title %s\n' "$VERSION" "$asset" "$VERSION"
    else
        gh release create "$VERSION" "$asset" --generate-notes --title "$VERSION"
    fi

    log "Release complete: $VERSION"
}

main "$@"
