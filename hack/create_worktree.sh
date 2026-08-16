#!/usr/bin/env bash
# Create or reuse an Eventloom worktree under ~/wt/open-sessionboard,
# provision its ignored environment files, and install dependencies.

set -euo pipefail

usage() {
  cat <<'EOF'
Usage: ./hack/create_worktree.sh [options] <worktree_name> [base_ref]

Options:
  --env-mode <mode>  local (default), symlink, copy, or none.
  --no-install       Skip `bun install --frozen-lockfile`.
  --refresh-env      Replace existing worktree environment files.
  --provider <name>  gjc (default) or omo.
  --launcher <name>  cmux (default), auto, or none.
  --no-launch        Create/setup only; alias for `--launcher none`.
  --focus            Focus the newly created cmux workspace.
  --prompt <text>    Start the selected agent with this literal task prompt.
  --prompt-file <p>  Read the selected agent task prompt from a file.
  --help             Show this help.

The default base ref is `main`. Worktrees are created under
$HOME/wt/open-sessionboard/<worktree_name>. Override the parent directory with
OPEN_SESSIONBOARD_WORKTREE_OVERRIDE_BASE; the repository name is still appended.

`local` writes only loopback/public development values. `copy` and `symlink`
provision ignored `.env`, `.env.*`, `.dev.vars`, and `.dev.vars.*` files from
the authoritative main checkout. `.env.example` files are never provisioned.
EOF
}

fail() {
  printf 'Error: %s\n' "$*" >&2
  exit 1
}

shell_quote() {
  local value=$1
  value=${value//\'/\'\"\'\"\'}
  printf "'%s'" "$value"
}

is_in_cmux() {
  [ -n "${CMUX_WORKSPACE_ID:-}" ] || [ -n "${CMUX_SURFACE_ID:-}" ]
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

ENV_MODE=local
INSTALL=true
REFRESH_ENV=false
PROVIDER=gjc
LAUNCHER=cmux
FOCUS=false
PROMPT=''
PROMPT_SET=false
PROMPT_FILE=''
while [ $# -gt 0 ]; do
  case "$1" in
    --env-mode)
      [ $# -ge 2 ] || fail '--env-mode requires local, symlink, copy, or none'
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
    --provider)
      [ $# -ge 2 ] || fail '--provider requires gjc or omo'
      PROVIDER=$2
      shift 2
      ;;
    --launcher)
      [ $# -ge 2 ] || fail '--launcher requires auto, cmux, or none'
      LAUNCHER=$2
      shift 2
      ;;
    --no-launch)
      LAUNCHER=none
      shift
      ;;
    --focus)
      FOCUS=true
      shift
      ;;
    --prompt)
      [ $# -ge 2 ] || fail '--prompt requires text'
      PROMPT=$2
      PROMPT_SET=true
      shift 2
      ;;
    --prompt-file)
      [ $# -ge 2 ] || fail '--prompt-file requires a path'
      PROMPT_FILE=$2
      shift 2
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
  local|symlink|copy|none) ;;
  *) fail "invalid env mode: $ENV_MODE" ;;
esac
case "$PROVIDER" in
  gjc|omo) ;;
  *) fail "invalid provider: $PROVIDER" ;;
esac
case "$LAUNCHER" in
  auto|cmux|none) ;;
  *) fail "invalid launcher: $LAUNCHER" ;;
esac
if [ "$INSTALL" = true ] && { [ "$ENV_MODE" = copy ] || [ "$ENV_MODE" = symlink ]; }; then
  fail "--env-mode $ENV_MODE provisions non-local secret files; use --no-install to prevent dependency lifecycle scripts from accessing them"
fi
[ "$PROMPT_SET" = false ] || [ -z "$PROMPT_FILE" ] || \

  fail 'use either --prompt or --prompt-file, not both'
if [ -n "$PROMPT_FILE" ]; then
  [ -f "$PROMPT_FILE" ] || fail "prompt file does not exist: $PROMPT_FILE"
  IFS= read -r -d '' PROMPT < "$PROMPT_FILE" || true
fi
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
  if [ "$ENV_MODE" = local ]; then
    local relative target target_dir
    for relative in .env apps/web/.env.local; do
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

      cat > "$target" <<'EOF'
# Generated local-only worktree configuration. Contains no provider credentials.
APP_ENV=local
WEB_ORIGIN=http://127.0.0.1:3015
NEXT_PUBLIC_APP_ENV=local
NEXT_PUBLIC_APP_URL=http://127.0.0.1:3015
API_UPSTREAM_ORIGIN=http://127.0.0.1:8787
NEXT_PUBLIC_ORGANIZATION_ID=ai-engineer
API_URL=http://127.0.0.1:8787
BETTER_AUTH_URL=http://127.0.0.1:8787
EOF
      chmod go-rwx "$target" 2>/dev/null || true
      printf 'Created local %s\n' "$relative"
    done
    return 0
  fi

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

if [ "$INSTALL" = true ]; then
  EXISTING_ENV_FILE=$(find "$WORKTREE_PATH" \
    \( -type d \( -name .git -o -name node_modules -o -name .next -o -name .wrangler -o -name dist \) -prune \) -o \
    \( \( -type f -o -type l \) \
      \( -name .env -o -name '.env.*' -o -name .dev.vars -o -name '.dev.vars.*' \) \
      ! -name .env.example ! -name '.env.*.example' -print -quit \))
  if [ -n "$EXISTING_ENV_FILE" ]; then
    fail 'refusing dependency installation in a worktree that already contains environment files; use --no-install'
  fi
  command -v bun >/dev/null 2>&1 || fail 'bun is required; use --no-install to skip setup'
  printf 'Installing dependencies in %s\n' "$WORKTREE_PATH"
  (cd "$WORKTREE_PATH" && bun install --frozen-lockfile)
else
  printf 'Dependency installation skipped.\n'
fi

provision_env_files

trap - ERR

if [ -z "$PROMPT" ]; then
  PROMPT=$(printf 'Implement the approved work in worktree %s. Branch: %s. Base: %s. Follow AGENTS.md, preserve unrelated work, implement fully, run focused and repository gates, and commit the verified result.' \
    "$WORKTREE_PATH" "$WORKTREE_NAME" "$BASE_REF")
fi
BRANCH_SLUG=$(printf '%s' "$WORKTREE_NAME" | tr -cs '[:alnum:]_.-' '-')
BRANCH_SLUG=${BRANCH_SLUG#-}
BRANCH_SLUG=${BRANCH_SLUG%-}
[ -n "$BRANCH_SLUG" ] || BRANCH_SLUG=worktree
SESSION_DIGEST=$(printf '%s\0%s' "$GIT_COMMON_DIR" "$WORKTREE_NAME" | \
  git -C "$REPO_ROOT" hash-object --stdin)
SESSION_DIGEST=${SESSION_DIGEST:0:12}
AGENT_PROMPT_DIR="$GIT_COMMON_DIR/gjc-worktree-prompts"
AGENT_PROMPT_FILE="$AGENT_PROMPT_DIR/$SESSION_DIGEST.txt"
mkdir -p "$AGENT_PROMPT_DIR"
printf 'Prompt: %s\n' "$PROMPT" > "$AGENT_PROMPT_FILE"
chmod go-rwx "$AGENT_PROMPT_FILE" 2>/dev/null || true

case "$PROVIDER" in
  gjc)
    AGENT_LABEL=GJC
    GJC_TMUX_SESSION="gjc-${REPO_NAME}-${BRANCH_SLUG}-${SESSION_DIGEST}"
    AGENT_COMMAND="cd $(shell_quote "$WORKTREE_PATH") && exec env $(shell_quote "GJC_TMUX_SESSION=$GJC_TMUX_SESSION") gjc --tmux \"\$(cat $(shell_quote "$AGENT_PROMPT_FILE"))\""
    ;;
  omo)
    AGENT_LABEL=OMO
    AGENT_COMMAND="cd $(shell_quote "$WORKTREE_PATH") && exec omo \"\$(cat $(shell_quote "$AGENT_PROMPT_FILE"))\""
    ;;
esac

SELECTED_LAUNCHER=$LAUNCHER
if [ "$SELECTED_LAUNCHER" = auto ]; then
  if is_in_cmux; then
    SELECTED_LAUNCHER=cmux
  else
    SELECTED_LAUNCHER=none
  fi
fi

print_manual_command() {
  printf 'Start %s manually from the worktree with:\n%s\n' \
    "$AGENT_LABEL" "$AGENT_COMMAND"
}

launch_cmux() {
  if ! command -v cmux >/dev/null 2>&1; then
    printf 'cmux is unavailable; the worktree remains ready at %s.\n' "$WORKTREE_PATH" >&2
    print_manual_command
    return 0
  fi
  local workspace_name="${REPO_NAME}/${WORKTREE_NAME}"
  local -a args=(
    new-workspace
    --name "$workspace_name"
    --cwd "$WORKTREE_PATH"
    --command "$AGENT_COMMAND"
    --focus "$FOCUS"
  )
  if ! cmux "${args[@]}"; then
    printf 'cmux launch failed; the worktree remains ready at %s.\n' "$WORKTREE_PATH" >&2
    print_manual_command
  fi
}

case "$SELECTED_LAUNCHER" in
  cmux) launch_cmux ;;
  none)
    printf 'Host launcher: none.\n'
    print_manual_command
    ;;
esac

printf '\nWorktree ready: %s\n' "$WORKTREE_PATH"
printf 'Branch: %s\n' "$WORKTREE_NAME"
printf 'Base: %s\n' "$BASE_REF"
printf 'Agent provider: %s\n' "$AGENT_LABEL"
if [ "$PROVIDER" = gjc ]; then
  printf 'GJC tmux session: %s\n' "$GJC_TMUX_SESSION"
fi
printf 'Remove it safely with:\n  ./hack/cleanup_worktree.sh %q\n' "$WORKTREE_NAME"
