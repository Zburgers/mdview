#!/usr/bin/env bash
set -Eeuo pipefail

MODE="push"

fail() {
    printf '[adr-guard] ERROR: %s\n' "$*" >&2
    exit 1
}

log() {
    printf '[adr-guard] %s\n' "$*"
}

usage() {
    cat <<'EOF'
Usage: scripts/adr_guard.sh [--mode push|release|commit]

Modes:
  push     Validate ADR layout and require outgoing ADR changes.
  release  Validate ADR layout and require ADR changes since latest tag.
  commit   Enforce atomic commit: ADR files must not be staged with non-ADR files.
EOF
}

parse_args() {
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --mode)
                [[ $# -ge 2 ]] || fail "--mode requires a value"
                MODE="$2"
                shift 2
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

    case "$MODE" in
        push|release|commit) ;;
        *) fail "Invalid mode '$MODE'" ;;
    esac
}

is_adr_dir() {
    local path="$1"
    [[ "$path" == docs/adr/template ]] && return 1
    [[ "$path" =~ ^docs/adr/[0-9]{4}-[a-z0-9-]+$ ]]
}

validate_adr_layout() {
    [[ -d docs/adr ]] || fail "Missing docs/adr directory"
    [[ -f docs/adr/README.md ]] || fail "Missing docs/adr/README.md"
    [[ -f docs/adr/template/adr.md ]] || fail "Missing docs/adr/template/adr.md"
    [[ -d docs/adr/template/assets ]] || fail "Missing docs/adr/template/assets"

    local dir
    while IFS= read -r dir; do
        if is_adr_dir "$dir"; then
            [[ -f "$dir/adr.md" ]] || fail "Missing $dir/adr.md"
            [[ -d "$dir/assets" ]] || fail "Missing $dir/assets directory"
        fi
    done < <(find docs/adr -mindepth 1 -maxdepth 1 -type d | sort)

    log "ADR layout checks passed"
}

has_adr_changes_in_range() {
    local range="$1"
    git diff --name-only "$range" -- docs/adr | grep -q .
}

ensure_push_has_adr_change() {
    local upstream
    upstream="$(git rev-parse --abbrev-ref --symbolic-full-name '@{upstream}' 2>/dev/null || true)"

    if [[ -z "$upstream" ]]; then
        fail "No upstream configured; set upstream first, then push via scripts/push.sh"
    fi

    local range
    range="$upstream..HEAD"
    if ! git rev-parse "$upstream" >/dev/null 2>&1; then
        fail "Unable to resolve upstream ref: $upstream"
    fi

    has_adr_changes_in_range "$range" || fail "Push blocked: no ADR changes detected in $range"
    log "Push ADR change check passed"
}

ensure_release_has_adr_change() {
    local latest_tag
    latest_tag="$(git describe --tags --abbrev=0 2>/dev/null || true)"
    local range

    if [[ -z "$latest_tag" ]]; then
        range="HEAD"
    else
        range="$latest_tag..HEAD"
    fi

    has_adr_changes_in_range "$range" || fail "Release blocked: no ADR changes detected in $range"
    log "Release ADR change check passed"
}

ensure_atomic_adr_commit() {
    local staged
    staged="$(git diff --cached --name-only)"
    [[ -n "$staged" ]] || exit 0

    local has_adr="false"
    local has_non_adr="false"
    local file

    while IFS= read -r file; do
        [[ -z "$file" ]] && continue
        if [[ "$file" == docs/adr/* ]]; then
            has_adr="true"
        else
            has_non_adr="true"
        fi
    done <<< "$staged"

    if [[ "$has_adr" == "true" && "$has_non_adr" == "true" ]]; then
        fail "Atomic commit rule: commit ADR files separately from non-ADR files"
    fi

    log "Atomic commit check passed"
}

main() {
    parse_args "$@"

    git rev-parse --is-inside-work-tree >/dev/null 2>&1 || fail "Not inside a git repository"

    validate_adr_layout

    case "$MODE" in
        push)
            ensure_push_has_adr_change
            ;;
        release)
            ensure_release_has_adr_change
            ;;
        commit)
            ensure_atomic_adr_commit
            ;;
    esac
}

main "$@"
