#!/usr/bin/env bash
set -Eeuo pipefail

fail() {
    printf '[push] ERROR: %s\n' "$*" >&2
    exit 1
}

main() {
    local remote="origin"
    local branch
    branch="$(git rev-parse --abbrev-ref HEAD)"

    [[ -x scripts/adr_guard.sh ]] || fail "Missing executable scripts/adr_guard.sh"
    scripts/adr_guard.sh --mode push

    if [[ $# -ge 1 ]]; then
        remote="$1"
    fi

    if [[ $# -ge 2 ]]; then
        branch="$2"
    fi

    git push "$remote" "$branch"
}

main "$@"
