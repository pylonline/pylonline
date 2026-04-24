#!/usr/bin/env bash
set -Eeuo pipefail

REPO_HTTPS_URL="${PYLONLINE_REPO_URL:-https://github.com/pylonline/pylonline.git}"
REPO_SSH_URL="${PYLONLINE_REPO_SSH_URL:-git@github.com:pylonline/pylonline.git}"
DEFAULT_TARGET_DIR="${PYLONLINE_TARGET_DIR:-pylonline}"
TARGET_DIR="$DEFAULT_TARGET_DIR"
WORK_DIR=""
CLONE_URL="$REPO_HTTPS_URL"
INSTALL_DEPS=1
CHECKOUT_MAIN=1

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

log() {
  printf '\n==> %s\n' "$*"
}

note() {
  printf '%s\n' "$*"
}

fail() {
  printf 'Error: %s\n' "$*" >&2
  exit 1
}

need_command() {
  command -v "$1" >/dev/null 2>&1 || fail "$1 is required. Install it, then run this installer again."
}

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

explain_auth() {
  log "GitHub access"
  note "This workspace uses Git submodules. Some submodules may require access to the pylonline GitHub organization."
  note "Use an account that can read these repositories before starting the clone."
}

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

  note "If clone asks for SSH access, add an SSH key to your GitHub account:"
  note "  https://github.com/settings/keys"
  note "GitHub SSH key setup guide:"
  note "  https://docs.github.com/authentication/connecting-to-github-with-ssh"
}

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

explain_manual_auth() {
  log "Manual authentication"
  note "If clone asks for credentials, use your GitHub username and a Personal Access Token as the password."
  note "Create a token at: https://github.com/settings/tokens"
  note "For private submodules, the token needs repository read access for the pylonline organization."
  note "GitHub does not accept account passwords for HTTPS Git operations."
}

check_target_dir() {
  if [ -e "$TARGET_DIR" ]; then
    if [ -d "$TARGET_DIR/.git" ]; then
      fail "$TARGET_DIR already contains a Git checkout. Choose another --dir or update it manually."
    fi
    fail "$TARGET_DIR already exists. Choose another --dir or remove the existing path."
  fi

  local target_parent
  local target_base
  target_parent="$(dirname -- "$TARGET_DIR")"
  target_base="$(basename -- "$TARGET_DIR")"

  [ -d "$target_parent" ] || fail "parent directory does not exist: $target_parent"

  WORK_DIR="$target_parent/.${target_base}.clone-tmp-$$"
  if [ -e "$WORK_DIR" ]; then
    fail "$WORK_DIR already exists. Remove it or rerun the installer."
  fi
}

clone_workspace() {
  log "Cloning workspace"
  note "Target: $TARGET_DIR"
  note "Repo:   $CLONE_URL"
  note "Working directory: $WORK_DIR"

  git clone \
    --recurse-submodules \
    --shallow-submodules \
    --depth=1 \
    --filter=blob:none \
    --jobs=8 \
    "$CLONE_URL" \
    "$WORK_DIR"
}

checkout_submodule_main() {
  [ "$CHECKOUT_MAIN" -eq 1 ] || return 0

  log "Switching submodules to main"
  git -C "$WORK_DIR" submodule foreach --recursive 'git switch main'
}

install_dependencies() {
  [ "$INSTALL_DEPS" -eq 1 ] || return 0

  log "Installing workspace dependencies"
  if command -v pnpm >/dev/null 2>&1; then
    pnpm -C "$WORK_DIR" install
    return 0
  fi

  if command -v corepack >/dev/null 2>&1; then
    note "pnpm was not found. Enabling pnpm through Corepack."
    corepack enable pnpm
    pnpm -C "$WORK_DIR" install
    return 0
  fi

  note "pnpm was not found, so dependency installation was skipped."
  note "Install Node.js with Corepack or pnpm, then run:"
  note "  cd $TARGET_DIR"
  note "  pnpm install"
}

publish_workspace() {
  log "Publishing completed workspace"
  mv "$WORK_DIR" "$TARGET_DIR"
  WORK_DIR=""
}

main() {
  parse_args "$@"

  log "Pylonline clone helper"
  need_command git
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

  log "Done"
  note "Workspace installed at: $TARGET_DIR"
  note "Next step:"
  note "  cd $TARGET_DIR"
}

main "$@"
