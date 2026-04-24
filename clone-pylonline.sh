#!/usr/bin/env bash
#
# Clone helper for the Pylonline multi-repository workspace.
#
# This script is designed for first-time setup:
#   - choose HTTPS or SSH access to the workspace repository,
#   - clone the root repository into a temporary directory,
#   - clone each Git submodule with readable per-repository output,
#   - optionally move submodules to their main branches,
#   - install workspace dependencies with pnpm or Corepack,
#   - publish the completed checkout into the requested target directory.
#
# The clone happens under /tmp first so editors do not detect half-built
# submodule working trees inside the final workspace while setup is running.
set -Eeuo pipefail

REPO_HTTPS_URL="${PYLONLINE_REPO_URL:-https://github.com/pylonline/pylonline.git}"
REPO_SSH_URL="${PYLONLINE_REPO_SSH_URL:-git@github.com:pylonline/pylonline.git}"
DEFAULT_TARGET_DIR="${PYLONLINE_TARGET_DIR:-pylonline}"
TARGET_DIR="$DEFAULT_TARGET_DIR"
WORK_DIR=""
LAUNCH_DIR="$(pwd -P)"
SCRIPT_PATH="${BASH_SOURCE[0]:-$0}"
CLONE_URL="$REPO_HTTPS_URL"
INSTALL_DEPS=1
CHECKOUT_MAIN=1

SEPARATOR="------------------------------------------------------------"

# Print command-line usage for humans running the helper directly.
usage() {
  cat <<'USAGE'
Clone the Pylonline workspace and private submodules.

Usage:
  ./clone-pylonline.sh [options]

Options:
  --dir <path>       Install into this directory. Default: pylonline
  --ssh              Clone with git@github.com:pylonline/pylonline.git
  --https            Clone with https://github.com/pylonline/pylonline.git
  --no-deps          Skip pnpm install after clone
  --pinned           Keep submodules at pinned commits instead of switching to main
  -h, --help         Show this help

Environment:
  PYLONLINE_TARGET_DIR    Default target directory
  PYLONLINE_REPO_URL      Override HTTPS clone URL
  PYLONLINE_REPO_SSH_URL  Override SSH clone URL
USAGE
}

# Print a visually separated major section heading.
log() {
  printf '\n%s\n==> %s\n%s\n' "$SEPARATOR" "$*" "$SEPARATOR"
}

# Print a short pending/progress line before long-running work.
step() {
  printf '... %s\n' "$*"
}

# Print ordinary informational output without extra decoration.
note() {
  printf '%s\n' "$*"
}

# Print a fatal error and stop immediately.
fail() {
  printf 'Error: %s\n' "$*" >&2
  exit 1
}

# Require an executable before reaching a part of the flow that depends on it.
need_command() {
  command -v "$1" >/dev/null 2>&1 || fail "$1 is required. Install it, then run this installer again."
}

# Ask an interactive yes/no question, returning false in non-interactive shells.
confirm() {
  local prompt="$1"
  local reply

  if [ ! -t 0 ]; then
    return 1
  fi

  printf '%s [y/N] ' "$prompt"
  read -r reply
  case "$reply" in
    y | Y | yes | YES) return 0 ;;
    *) return 1 ;;
  esac
}

# Parse CLI flags into the global settings used by the rest of the script.
parse_args() {
  while [ "$#" -gt 0 ]; do
    case "$1" in
      --dir)
        [ "$#" -ge 2 ] || fail "--dir requires a path"
        TARGET_DIR="$2"
        shift 2
        ;;
      --ssh)
        CLONE_URL="$REPO_SSH_URL"
        shift
        ;;
      --https)
        CLONE_URL="$REPO_HTTPS_URL"
        shift
        ;;
      --no-deps)
        INSTALL_DEPS=0
        shift
        ;;
      --pinned)
        CHECKOUT_MAIN=0
        shift
        ;;
      -h | --help)
        usage
        exit 0
        ;;
      *)
        fail "unknown option: $1"
        ;;
    esac
  done
}

# Show authentication setup guidance before any network operation starts.
explain_auth() {
  log "GitHub access checklist"
  note "This workspace uses private GitHub submodules. If the clone fails, review these access steps before retrying."
  note ""
  note "Recommended SSH setup:"
  note "  1. Create a key if needed:"
  note "     ssh-keygen -t ed25519 -C \"you@example.com\""
  note "  2. Add the key to your local agent:"
  note "     eval \"\$(ssh-agent -s)\""
  note "     ssh-add ~/.ssh/id_ed25519"
  note "  3. Add the public key to GitHub:"
  note "     https://github.com/settings/keys"
  note "  4. Test access:"
  note "     ssh -T git@github.com"
  note "  5. Retry this helper with SSH:"
  note "     ./clone-pylonline.sh --ssh"
  note ""
  note "HTTPS fallback:"
  note "  Create a GitHub Personal Access Token with read access to the pylonline repositories."
  note "  Use your GitHub username when prompted and the token as the password."
  note "  GitHub token page: https://github.com/settings/tokens"
  note "  Optional local credential helper:"
  note "     git config --global credential.helper store"
}

# Verify or optionally bootstrap SSH auth when the user selected --ssh.
setup_ssh_auth() {
  log "SSH authentication"
  note "The installer will clone with SSH: $REPO_SSH_URL"

  if command -v ssh >/dev/null 2>&1 && ssh -T git@github.com >/dev/null 2>&1; then
    note "GitHub SSH authentication is already working."
    return 0
  fi

  if command -v gh >/dev/null 2>&1 && confirm "Start GitHub CLI SSH login now?"; then
    gh auth login -h github.com -p ssh -w
    gh auth setup-git -h github.com
    return 0
  fi

  note "SSH is not verified yet. The checklist above shows the local key and GitHub key setup steps."
}

# Use GitHub CLI for HTTPS credentials when it is available and configured.
setup_gh_auth() {
  if ! command -v gh >/dev/null 2>&1; then
    return 1
  fi

  if gh auth status -h github.com >/dev/null 2>&1; then
    note "GitHub CLI is already authenticated."
    return 0
  fi

  if confirm "GitHub CLI is installed but not authenticated. Start 'gh auth login' now?"; then
    gh auth login -h github.com -p https -w
    gh auth setup-git -h github.com
    return 0
  fi

  return 1
}

# Explain the HTTPS token fallback when GitHub CLI cannot handle auth.
explain_manual_auth() {
  log "HTTPS authentication"
  note "GitHub CLI is not authenticated, so Git may ask for credentials during the HTTPS clone."
  note "Use your GitHub username and a Personal Access Token as the password."
}

# Reserve the final target path and create the temporary clone directory.
check_target_dir() {
  if [ -e "$TARGET_DIR" ]; then
    if [ -d "$TARGET_DIR/.git" ]; then
      fail "$TARGET_DIR already contains a Git checkout. Choose another --dir or update it manually."
    fi
    fail "$TARGET_DIR already exists. Choose another --dir or remove the existing path."
  fi

  local target_parent
  target_parent="$(dirname -- "$TARGET_DIR")"

  [ -d "$target_parent" ] || fail "parent directory does not exist: $target_parent"

  mkdir "$TARGET_DIR"
  WORK_DIR="$(mktemp -d "${TMPDIR:-/tmp}/pylonline-clone.XXXXXXXXXX")"
}

# Clone only the root repository first so submodule output can be grouped later.
clone_workspace() {
  log "Cloning workspace"
  note "Target: $TARGET_DIR"
  note "Repo:   $CLONE_URL"
  note "Working directory: $WORK_DIR"
  step "Cloning root repository..."

  git clone \
    --depth=1 \
    --filter=blob:none \
    --no-recurse-submodules \
    "$CLONE_URL" \
    "$WORK_DIR"

  clone_submodules
}

# Clone submodules one at a time to keep terminal output tied to each repo.
clone_submodules() {
  local key
  local name
  local path
  local url

  step "Reading submodule list..."
  git -C "$WORK_DIR" submodule sync --recursive
  git -C "$WORK_DIR" submodule init

  while IFS=' ' read -r key path; do
    name="${key#submodule.}"
    name="${name%.path}"
    path="$(git -C "$WORK_DIR" config -f .gitmodules --get "submodule.$name.path")"
    url="$(git -C "$WORK_DIR" config -f .gitmodules --get "submodule.$name.url")"

    log "Submodule: $name"
    note "Path: $path"
    note "Repo: $url"
    step "Cloning $name..."

    git -C "$WORK_DIR" submodule update \
      --init \
      --depth=1 \
      --filter=blob:none \
      --recommend-shallow \
      -- "$path"
  done < <(git -C "$WORK_DIR" config -f .gitmodules --get-regexp '^submodule\..*\.path$')
}

# Optionally move every submodule from the pinned commit to its main branch.
checkout_submodule_main() {
  [ "$CHECKOUT_MAIN" -eq 1 ] || return 0

  log "Switching submodules to main"
  step "Checking out main in each submodule..."
  git -C "$WORK_DIR" submodule foreach --recursive 'git switch main'
}

# Install JavaScript dependencies, enabling pnpm via Corepack when necessary.
install_dependencies() {
  [ "$INSTALL_DEPS" -eq 1 ] || return 0

  log "Installing workspace dependencies"
  if command -v pnpm >/dev/null 2>&1; then
    step "Running pnpm install..."
    pnpm -C "$WORK_DIR" install
    return 0
  fi

  if command -v corepack >/dev/null 2>&1; then
    note "pnpm was not found. Enabling pnpm through Corepack."
    step "Enabling pnpm with Corepack..."
    corepack enable pnpm
    step "Running pnpm install..."
    pnpm -C "$WORK_DIR" install
    return 0
  fi

  note "pnpm was not found, so dependency installation was skipped."
  note "Install Node.js with Corepack or pnpm, then run:"
  note "  cd $TARGET_DIR"
  note "  pnpm install"
}

# Move a fully prepared checkout into place only after all setup steps succeed.
publish_workspace() {
  log "Publishing completed workspace"
  step "Moving completed clone into $TARGET_DIR..."
  mv "$WORK_DIR/.git" "$TARGET_DIR/.git"
  (
    shopt -s dotglob nullglob
    for entry in "$WORK_DIR"/*; do
      mv "$entry" "$TARGET_DIR/"
    done
  )
  rmdir "$WORK_DIR"
  WORK_DIR=""
}

# Remove the one-off downloaded helper while keeping the tracked copy in repos.
remove_downloaded_helper() {
  local script_abs
  local target_abs

  script_abs="$(cd "$(dirname -- "$SCRIPT_PATH")" && pwd -P)/$(basename -- "$SCRIPT_PATH")"
  target_abs="$(cd "$TARGET_DIR" && pwd -P)"

  if [ "$script_abs" = "$target_abs/clone-pylonline.sh" ]; then
    note "Keeping tracked helper at: $script_abs"
    return 0
  fi

  case "$script_abs" in
    "$LAUNCH_DIR"/clone-pylonline.sh)
      rm -f -- "$script_abs"
      note "Removed downloaded helper: $script_abs"
      ;;
  esac
}

# Run the setup flow in the order users experience it.
main() {
  parse_args "$@"

  log "Pylonline clone helper"
  need_command git
  need_command mktemp
  explain_auth
  if [ "$CLONE_URL" = "$REPO_SSH_URL" ]; then
    setup_ssh_auth
  else
    setup_gh_auth || explain_manual_auth
  fi
  check_target_dir
  clone_workspace
  checkout_submodule_main
  install_dependencies
  publish_workspace
  remove_downloaded_helper

  log "Done"
  note "Workspace installed at: $TARGET_DIR"
}

main "$@"
