#!/usr/bin/env bash
# Create or reuse an Open Sessionboard worktree under ~/wt/open-sessionboard,
# provision its ignored environment files, and install dependencies.

set -euo pipefail

usage() {
  cat <<'EOF'
Usage: ./hack/create_worktree.sh [options] <worktree_name> [base_ref]

Options:
  --env-mode <mode>  symlink (default), copy, or none.
  --no-install       Skip `bun install --frozen-lockfile`.
  --refresh-env      Replace existing worktree environment files.
  --help             Show this help.

The default base ref is `main`. Worktrees are created under
$HOME/wt/open-sessionboard/<worktree_name>. Override the parent directory with
OPEN_SESSIONBOARD_WORKTREE_OVERRIDE_BASE; the repository name is still appended.

Ignored `.env`, `.env.*`, `.dev.vars`, and `.dev.vars.*` files are provisioned
from the authoritative main checkout. `.env.example` files are never copied or
linked.
EOF
}

fail() {
  printf 'Error: %s\n' "$*" >&2
  exit 1
}

registered_worktree_for_branch() {
  local wanted_branch=$1 line current_path=''
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in
      'worktree '*) current_path=${line#worktree } ;;
      'branch refs/heads/'*)
        if [ "${line#branch refs/heads/}" = "$wanted_branch" ]; then
          printf '%s\n' "$current_path"
          return 0
        fi
        ;;
    esac
  done < <(git -C "$REPO_ROOT" worktree list --porcelain)
  return 1
}

registered_branch_at_path() {
  local wanted_path=$1 line current_path='' current_branch=''
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in
      'worktree '*)
        if [ "$current_path" = "$wanted_path" ]; then
          printf '%s\n' "$current_branch"
          return 0
        fi
        current_path=${line#worktree }
        current_branch=''
        ;;
      'branch refs/heads/'*) current_branch=${line#branch refs/heads/} ;;
    esac
  done < <(git -C "$REPO_ROOT" worktree list --porcelain)
  if [ "$current_path" = "$wanted_path" ]; then
    printf '%s\n' "$current_branch"
    return 0
  fi
  return 1
}

ENV_MODE=symlink
INSTALL=true
REFRESH_ENV=false

while [ $# -gt 0 ]; do
  case "$1" in
    --env-mode)
      [ $# -ge 2 ] || fail '--env-mode requires symlink, copy, or none'
      ENV_MODE=$2
      shift 2
      ;;
    --no-install)
      INSTALL=false
      shift
      ;;
    --refresh-env)
      REFRESH_ENV=true
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

case "$ENV_MODE" in
  symlink|copy|none) ;;
  *) fail "invalid env mode: $ENV_MODE" ;;
esac
[ $# -ge 1 ] || { usage >&2; exit 2; }
[ $# -le 2 ] || fail 'expected worktree_name and optional base_ref'

WORKTREE_NAME=$1
BASE_REF=${2:-main}
[ -n "$WORKTREE_NAME" ] || fail 'worktree name must not be empty'
case "$WORKTREE_NAME" in
  /*) fail 'worktree name must be relative' ;;
esac
IFS=/ read -r -a name_parts <<< "$WORKTREE_NAME"
for part in "${name_parts[@]}"; do
  [ -n "$part" ] && [ "$part" != . ] && [ "$part" != .. ] || \
    fail 'worktree name must not contain empty, . or .. path components'
done
git check-ref-format --branch "$WORKTREE_NAME" >/dev/null || \
  fail "invalid branch/worktree name: $WORKTREE_NAME"

REPO_ROOT=$(git rev-parse --show-toplevel) || fail 'run inside a Git repository'
GIT_COMMON_DIR=$(git -C "$REPO_ROOT" rev-parse --path-format=absolute --git-common-dir) || \
  fail 'could not resolve the common Git directory'
MAIN_CHECKOUT=$(dirname "$GIT_COMMON_DIR")
REPO_NAME=$(basename "$MAIN_CHECKOUT")
WORKTREE_PARENT=${OPEN_SESSIONBOARD_WORKTREE_OVERRIDE_BASE:-"$HOME/wt"}
WORKTREE_BASE="$WORKTREE_PARENT/$REPO_NAME"
mkdir -p "$WORKTREE_BASE"
WORKTREE_BASE=$(cd "$WORKTREE_BASE" && pwd -P)
WORKTREE_PATH="$WORKTREE_BASE/$WORKTREE_NAME"

BASE_COMMIT=''
if git -C "$REPO_ROOT" show-ref --verify --quiet "refs/heads/$BASE_REF"; then
  BASE_COMMIT=$BASE_REF
elif git -C "$REPO_ROOT" show-ref --verify --quiet "refs/remotes/$BASE_REF"; then
  BASE_COMMIT=$BASE_REF
elif [[ "$BASE_REF" == */* ]]; then
  remote=${BASE_REF%%/*}
  remote_branch=${BASE_REF#*/}
  git -C "$REPO_ROOT" fetch "$remote" "$remote_branch"
  git -C "$REPO_ROOT" show-ref --verify --quiet "refs/remotes/$BASE_REF" || \
    fail "remote base ref does not exist: $BASE_REF"
  BASE_COMMIT=$BASE_REF
else
  fail "base ref does not exist: $BASE_REF"
fi

CREATED_WORKTREE=false
CREATED_BRANCH=false
cleanup_failed_creation() {
  [ "$CREATED_WORKTREE" = true ] || return 0
  git -C "$REPO_ROOT" worktree remove --force "$WORKTREE_PATH" >/dev/null 2>&1 || true
  if [ "$CREATED_BRANCH" = true ]; then
    git -C "$REPO_ROOT" branch -D "$WORKTREE_NAME" >/dev/null 2>&1 || true
  fi
}
trap cleanup_failed_creation ERR

if existing_path=$(registered_worktree_for_branch "$WORKTREE_NAME"); then
  existing_path=$(cd "$existing_path" && pwd -P)
  [ "$existing_path" = "$WORKTREE_PATH" ] || \
    fail "branch '$WORKTREE_NAME' is already checked out at $existing_path"
  printf 'Reusing registered worktree: %s\n' "$WORKTREE_PATH"
elif existing_branch=$(registered_branch_at_path "$WORKTREE_PATH"); then
  fail "worktree path is registered on branch '${existing_branch:-detached}', not '$WORKTREE_NAME'"
elif [ -e "$WORKTREE_PATH" ] || [ -L "$WORKTREE_PATH" ]; then
  fail "target path already exists and is not a registered matching worktree: $WORKTREE_PATH"
else
  mkdir -p "$(dirname "$WORKTREE_PATH")"
  if git -C "$REPO_ROOT" show-ref --verify --quiet "refs/heads/$WORKTREE_NAME"; then
    git -C "$REPO_ROOT" worktree add "$WORKTREE_PATH" "$WORKTREE_NAME"
  else
    git -C "$REPO_ROOT" worktree add -b "$WORKTREE_NAME" "$WORKTREE_PATH" "$BASE_COMMIT"
    CREATED_BRANCH=true
  fi
  CREATED_WORKTREE=true
fi

provision_env_files() {
  [ "$ENV_MODE" != none ] || {
    printf 'Environment provisioning disabled.\n'
    return 0
  }

  while IFS= read -r -d '' source_file; do
    local relative target target_dir
    relative=${source_file#"$MAIN_CHECKOUT"/}
    target="$WORKTREE_PATH/$relative"
    target_dir=$(dirname "$target")
    mkdir -p "$target_dir"

    if [ -e "$target" ] || [ -L "$target" ]; then
      if [ "$REFRESH_ENV" != true ]; then
        printf 'Keeping existing %s\n' "$relative"
        continue
      fi
      rm -f "$target"
    fi

    if [ "$ENV_MODE" = symlink ]; then
      ln -s "$source_file" "$target"
      printf 'Symlinked %s -> %s\n' "$relative" "$source_file"
    else
      cp -p "$source_file" "$target"
      chmod go-rwx "$target" 2>/dev/null || true
      printf 'Copied %s\n' "$relative"
    fi
  done < <(
    find "$MAIN_CHECKOUT" \
      \( -type d \( -name .git -o -name node_modules -o -name .next -o -name .wrangler -o -name dist \) -prune \) -o \
      \( \( -type f -o -type l \) \
        \( -name .env -o -name '.env.*' -o -name .dev.vars -o -name '.dev.vars.*' \) \
        ! -name .env.example ! -name '.env.*.example' -print0 \)
  )
}

provision_env_files

if [ "$INSTALL" = true ]; then
  command -v bun >/dev/null 2>&1 || fail 'bun is required; use --no-install to skip setup'
  printf 'Installing dependencies in %s\n' "$WORKTREE_PATH"
  (cd "$WORKTREE_PATH" && bun install --frozen-lockfile)
else
  printf 'Dependency installation skipped.\n'
fi

trap - ERR
printf '\nWorktree ready: %s\n' "$WORKTREE_PATH"
printf 'Branch: %s\n' "$WORKTREE_NAME"
printf 'Base: %s\n' "$BASE_REF"
printf 'Remove it safely with:\n  ./hack/cleanup_worktree.sh %q\n' "$WORKTREE_NAME"
