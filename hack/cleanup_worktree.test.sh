#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd -P)
CREATE="$SCRIPT_DIR/create_worktree.sh"
CLEANUP="$SCRIPT_DIR/cleanup_worktree.sh"
TMP=$(mktemp -d)
TMP=$(cd "$TMP" && pwd -P)
trap 'rm -rf "$TMP"' EXIT

fail() {
  printf 'FAIL: %s\n' "$*" >&2
  exit 1
}

REPO="$TMP/eventloom"
OVERRIDE="$TMP/wt"
git -C "$TMP" init -b main eventloom >/dev/null
git -C "$REPO" config user.email test@example.com
git -C "$REPO" config user.name Test
printf 'tracked\n' > "$REPO/README.md"
git -C "$REPO" add README.md
git -C "$REPO" commit -m initial >/dev/null

create() {
  (cd "$REPO" && OPEN_SESSIONBOARD_WORKTREE_OVERRIDE_BASE="$OVERRIDE" \
    "$CREATE" --no-launch --no-install --env-mode none "$1" main >/dev/null)
}
cleanup() {
  (cd "$REPO" && OPEN_SESSIONBOARD_WORKTREE_OVERRIDE_BASE="$OVERRIDE" \
    "$CLEANUP" "$@")
}

create dirty
DIRTY_PATH="$OVERRIDE/eventloom/dirty"
printf 'uncommitted\n' > "$DIRTY_PATH/local.txt"
if cleanup dirty >/dev/null 2>&1; then
  fail 'dirty worktree was removed without --force'
fi
[ -d "$DIRTY_PATH" ] || fail 'dirty worktree disappeared after refused cleanup'
cleanup --force --delete-branch dirty >/dev/null
[ ! -e "$DIRTY_PATH" ] || fail 'forced cleanup did not remove the worktree'
if git -C "$REPO" show-ref --verify --quiet refs/heads/dirty; then
  fail 'forced branch deletion did not delete the branch'
fi

create merged
MERGED_PATH="$OVERRIDE/eventloom/merged"
cleanup --delete-branch merged >/dev/null
[ ! -e "$MERGED_PATH" ] || fail 'clean merged worktree was not removed'
if git -C "$REPO" show-ref --verify --quiet refs/heads/merged; then
  fail 'merged branch was not deleted'
fi

create listed
LIST_OUTPUT=$(cleanup)
printf '%s\n' "$LIST_OUTPUT" | grep -F "$OVERRIDE/eventloom/listed" >/dev/null || \
  fail 'managed worktree was not listed'

if cleanup "$REPO" >/dev/null 2>&1; then
  fail 'cleanup accepted the main checkout outside the managed base'
fi
cleanup listed >/dev/null

printf 'cleanup_worktree tests passed\n'
