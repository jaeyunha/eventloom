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
assert() {
  "$@" || fail "command failed: $*"
}

REPO="$TMP/open-sessionboard"
OVERRIDE="$TMP/wt"
mkdir -p "$REPO/apps/web" "$REPO/apps/api"
git -C "$TMP" init -b main open-sessionboard >/dev/null
REPO=$(cd "$REPO" && pwd -P)
git -C "$REPO" config user.email test@example.com
git -C "$REPO" config user.name Test
printf 'tracked\n' > "$REPO/README.md"
printf '.env\n.env.*\n.dev.vars\n' > "$REPO/.gitignore"
git -C "$REPO" add README.md .gitignore
git -C "$REPO" commit -m initial >/dev/null
printf 'ROOT_SECRET=first\n' > "$REPO/.env"
printf 'WEB_SECRET=second\n' > "$REPO/apps/web/.env.local"
printf 'API_SECRET=third\n' > "$REPO/apps/api/.dev.vars"
printf 'example\n' > "$REPO/.env.example"

(
  cd "$REPO"
  OPEN_SESSIONBOARD_WORKTREE_OVERRIDE_BASE="$OVERRIDE" \
    "$CREATE" --no-install feature/test main >/dev/null
)

WORKTREE="$OVERRIDE/open-sessionboard/feature/test"
assert test -d "$WORKTREE"
assert test -L "$WORKTREE/.env"
assert test -L "$WORKTREE/apps/web/.env.local"
assert test -L "$WORKTREE/apps/api/.dev.vars"
assert test ! -e "$WORKTREE/.env.example"
assert test "$(readlink "$WORKTREE/.env")" = "$REPO/.env"
assert test "$(git -C "$WORKTREE" branch --show-current)" = feature/test
printf 'ROOT_SECRET=updated\n' > "$REPO/.env"
assert grep -q updated "$WORKTREE/.env"

# Exact re-use is safe and idempotent.
(
  cd "$REPO"
  OPEN_SESSIONBOARD_WORKTREE_OVERRIDE_BASE="$OVERRIDE" \
    "$CREATE" --no-install feature/test main >/dev/null
)

# Environment provisioning can be disabled explicitly.
(
  cd "$REPO"
  OPEN_SESSIONBOARD_WORKTREE_OVERRIDE_BASE="$OVERRIDE" \
    "$CREATE" --no-install --env-mode none no-env main >/dev/null
)
assert test ! -e "$OVERRIDE/open-sessionboard/no-env/.env"

# Traversal and invalid bases fail closed.
if (cd "$REPO" && OPEN_SESSIONBOARD_WORKTREE_OVERRIDE_BASE="$OVERRIDE" \
  "$CREATE" --no-install ../escape main >/dev/null 2>&1); then
  fail 'path traversal name was accepted'
fi
if (cd "$REPO" && OPEN_SESSIONBOARD_WORKTREE_OVERRIDE_BASE="$OVERRIDE" \
  "$CREATE" --no-install missing-base does-not-exist >/dev/null 2>&1); then
  fail 'missing base ref was accepted'
fi

(
  cd "$REPO"
  OPEN_SESSIONBOARD_WORKTREE_OVERRIDE_BASE="$OVERRIDE" \
    "$CLEANUP" feature/test >/dev/null
  OPEN_SESSIONBOARD_WORKTREE_OVERRIDE_BASE="$OVERRIDE" \
    "$CLEANUP" no-env >/dev/null
)
assert test ! -e "$WORKTREE"
assert git -C "$REPO" show-ref --verify --quiet refs/heads/feature/test

printf 'create_worktree tests passed\n'
