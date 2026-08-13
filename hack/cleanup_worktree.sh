#!/usr/bin/env bash
# Safely remove Eventloom worktrees created under ~/wt/open-sessionboard.

set -euo pipefail

usage() {
  cat <<'EOF'
Usage: ./hack/cleanup_worktree.sh [options] [worktree_name_or_path]

Options:
  --force          Remove a dirty worktree. Without this flag, cleanup refuses.
  --delete-branch  Delete the checked-out branch after removing the worktree.
                   Without --force, the branch must already be merged into main.
  --help           Show this help.

With no worktree argument, the script lists managed worktrees. Relative names are
resolved beneath $HOME/wt/open-sessionboard. Override the parent directory with
OPEN_SESSIONBOARD_WORKTREE_OVERRIDE_BASE.
EOF
}

fail() {
  printf 'Error: %s\n' "$*" >&2
  exit 1
}

FORCE=false
DELETE_BRANCH=false
while [ $# -gt 0 ]; do
  case "$1" in
    --force)
      FORCE=true
      shift
      ;;
    --delete-branch)
      DELETE_BRANCH=true
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    --)
      shift
      break
      ;;
    -*) fail "unknown option: $1" ;;
    *) break ;;
  esac
done
[ $# -le 1 ] || fail 'expected at most one worktree name or path'

REPO_ROOT=$(git rev-parse --show-toplevel) || fail 'run inside a Git repository'
GIT_COMMON_DIR=$(git -C "$REPO_ROOT" rev-parse --path-format=absolute --git-common-dir) || \
  fail 'could not resolve the common Git directory'
MAIN_CHECKOUT=$(dirname "$GIT_COMMON_DIR")
REPO_NAME=$(basename "$MAIN_CHECKOUT")
WORKTREE_PARENT=${OPEN_SESSIONBOARD_WORKTREE_OVERRIDE_BASE:-"$HOME/wt"}
WORKTREE_BASE="$WORKTREE_PARENT/$REPO_NAME"
mkdir -p "$WORKTREE_BASE"
WORKTREE_BASE=$(cd "$WORKTREE_BASE" && pwd -P)

list_managed_worktrees() {
  local line path found=false
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in
      'worktree '*)
        path=${line#worktree }
        case "$path" in
          "$WORKTREE_BASE"/*)
            printf '%s\n' "$path"
            found=true
            ;;
        esac
        ;;
    esac
  done < <(git -C "$REPO_ROOT" worktree list --porcelain)
  [ "$found" = true ] || printf 'No managed worktrees under %s\n' "$WORKTREE_BASE"
}

if [ $# -eq 0 ]; then
  list_managed_worktrees
  exit 0
fi

WORKTREE_ARG=$1
if [[ "$WORKTREE_ARG" == /* ]]; then
  REQUESTED_PATH=$WORKTREE_ARG
else
  REQUESTED_PATH="$WORKTREE_BASE/$WORKTREE_ARG"
fi
[ -d "$REQUESTED_PATH" ] || fail "worktree directory does not exist: $REQUESTED_PATH"
WORKTREE_PATH=$(cd "$REQUESTED_PATH" && pwd -P)

case "$WORKTREE_PATH" in
  "$WORKTREE_BASE"/*) ;;
  *) fail "refusing to remove a worktree outside $WORKTREE_BASE" ;;
esac
[ "$WORKTREE_PATH" != "$MAIN_CHECKOUT" ] || fail 'refusing to remove the main checkout'

git -C "$REPO_ROOT" worktree list --porcelain | \
  grep -Fx -- "worktree $WORKTREE_PATH" >/dev/null || \
  fail "path is not an exact registered worktree: $WORKTREE_PATH"

WORKTREE_BRANCH=$(git -C "$WORKTREE_PATH" branch --show-current || true)
DIRTY=$(git -C "$WORKTREE_PATH" status --porcelain)
if [ -n "$DIRTY" ] && [ "$FORCE" != true ]; then
  printf '%s\n' "$DIRTY" >&2
  fail 'worktree has uncommitted changes; commit/stash them or rerun with --force'
fi

if [ "$DELETE_BRANCH" = true ] && [ -n "$WORKTREE_BRANCH" ]; then
  case "$WORKTREE_BRANCH" in
    main|master) fail "refusing to delete protected branch '$WORKTREE_BRANCH'" ;;
  esac
  if [ "$FORCE" != true ]; then
    git -C "$REPO_ROOT" merge-base --is-ancestor "$WORKTREE_BRANCH" main || \
      fail "branch '$WORKTREE_BRANCH' is not merged into main; keep it or use --force"
  fi
fi

printf 'Removing worktree: %s\n' "$WORKTREE_PATH"
if [ "$FORCE" = true ]; then
  git -C "$REPO_ROOT" worktree remove --force "$WORKTREE_PATH"
else
  git -C "$REPO_ROOT" worktree remove "$WORKTREE_PATH"
fi
git -C "$REPO_ROOT" worktree prune

if [ "$DELETE_BRANCH" = true ] && [ -n "$WORKTREE_BRANCH" ]; then
  if [ "$FORCE" = true ]; then
    git -C "$REPO_ROOT" branch -D "$WORKTREE_BRANCH"
  else
    git -C "$REPO_ROOT" branch -d "$WORKTREE_BRANCH"
  fi
elif [ -n "$WORKTREE_BRANCH" ]; then
  printf 'Kept branch: %s\n' "$WORKTREE_BRANCH"
fi

printf 'Cleanup complete.\n'
