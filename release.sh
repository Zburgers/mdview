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

Pushes a prepared X.Y.Z branch and opens its release PR. After merge, GitHub
Actions validates and builds all platforms before creating the immutable tag.

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

main() {
    parse_args "$@"

    [[ -n "$VERSION" ]] || fail "--version is required"
    validate_version "$VERSION"

    require_cmd git
    require_cmd node
    require_cmd gh

    git rev-parse --is-inside-work-tree >/dev/null 2>&1 || fail "Not inside a git repository"

    require_clean_git
    [[ "$(git branch --show-current)" == "${VERSION#v}" ]] || fail "Run from the prepared ${VERSION#v} release branch."
    node scripts/validate-release-version.mjs --tag "$VERSION"

    if git rev-parse "$VERSION" >/dev/null 2>&1; then
        fail "Tag already exists locally: $VERSION"
    fi

    if git ls-remote --exit-code --tags origin "refs/tags/$VERSION" >/dev/null 2>&1; then
        fail "Tag already exists on origin: $VERSION"
    fi

    run_cmd git push -u origin "${VERSION#v}"
    run_cmd gh pr create --base main --head "${VERSION#v}" --title "release: $VERSION" \
        --body "Release $VERSION from the prepared version sources and CHANGELOG.md. Native validation and builds must pass before tagging."
    log "Merge the release PR after required CI passes to build and publish $VERSION."
}

main "$@"
