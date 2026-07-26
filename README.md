# Pylonline Workspace

This repository is the workspace and orchestration layer for the Pylonline codebase.

Child repos (`core-ui`, `portal`, `pylon`, and the rest) live in the
[`pylonline` GitHub organization](https://github.com/pylonline). The public
[`pylonline/pylonline`](https://github.com/pylonline/pylonline) repo is the
workspace orchestrator; product code stays in the private submodule repos.

## GitHub access

Before cloning, make sure your GitHub account can read the private repos in the
`pylonline` organization:

- You must be a member of the `pylonline` org, or use a token/SSH key with access
  to its private repositories.
- If the org uses SAML SSO, authorize your Personal Access Token or SSH key for
  the `pylonline` org after creating it
  ([SSO authorization](https://docs.github.com/en/enterprise-cloud@latest/authentication/authenticating-with-saml-single-sign-on/authorizing-a-personal-access-token-for-use-with-saml-single-sign-on)).
- Workspace CI uses a `PACKAGES_PAT` secret with the same org access for
  submodule checkout and GitHub Packages.

The [`pylonline` org profile](https://github.com/pylonline) does not need its
own README for cloning to work. Optional later: add an org profile README via a
`pylonline/.github` repository.

## How to Clone

Download and run the installer from this repo:

```bash
curl -fsSL https://raw.githubusercontent.com/pylonline/pylonline/main/clone-pylonline.sh -o clone-pylonline.sh
chmod +x clone-pylonline.sh
./clone-pylonline.sh
```

The installer assumes you already have a GitHub account. It checks for Git,
walks you through GitHub authentication when needed, clones this workspace with
submodules, switches initialized submodules to `main`, and installs workspace
dependencies with `pnpm` when available. It creates the visible `pylonline/`
folder immediately, clones into a hidden temporary folder inside it, then
publishes the completed checkout into `pylonline/` after checkout completes so
editors do not show half-cloned submodules as file changes.

If you prefer SSH:

```bash
./clone-pylonline.sh --ssh
```

After cloning, open the multi-root workspace in Cursor or VS Code:

**Local machine (GUI):**

```bash
cd pylonline
cursor pylonline.code-workspace
# or: code pylonline.code-workspace
```

**Remote SSH (e.g. home server):** the `cursor` / `code` CLI in an SSH session cannot
talk to your desktop app. In Cursor on your local machine, connect via Remote SSH,
then open `~/pylonline-workspace/pylonline/pylonline.code-workspace` (or your clone path).

It uses Git submodules to pin the active child-repo commits for coordinated development and verification.

It is not the source-of-truth repo for app code. The source-of-truth lives in these child repos:

- `core-lint`
- `core-ui`
- `docs`
- `portal`
- `pylon`
- `scripts`

Those repos are tracked here as Git submodules so the workspace can pin a known-good combination of commits.

## Layout

```text
pylonline/
  core-lint/   # shared lint/format/package-quality tooling
  core-ui/     # shared UI assets, pages, and sync helpers
  docs/        # workspace notes and repo map
  portal/      # portal app
  pylon/       # pylon app
  scripts/     # shared workspace scripts and operator tooling
```

## What Lives Here

- `pnpm-workspace.yaml`
- workspace-level `package.json`
- shared local-install topology
- submodule pointers for the tracked child repos
- workspace docs and ramp-up notes

## Bootstrap

Preferred first-time setup:

```bash
curl -fsSL https://raw.githubusercontent.com/pylonline/pylonline/main/clone-pylonline.sh -o clone-pylonline.sh
chmod +x clone-pylonline.sh
./clone-pylonline.sh
cd pylonline
# Local GUI: cursor pylonline.code-workspace
# Remote SSH: open pylonline.code-workspace from Cursor Remote SSH on your desktop
```

The clone helper fetches full history (no shallow clone) so branches stay mergeable,
initializes submodules under the `pylonline` org, switches them to `main`, and runs
`pnpm install`.

Manual bootstrap (same org URLs as `.gitmodules`):

```bash
git clone \
  --recurse-submodules \
  --filter=blob:none \
  --jobs=8 \
  https://github.com/pylonline/pylonline.git
cd pylonline
git submodule foreach --recursive 'git switch main'
pnpm install
```

The `--jobs=8` flag fetches submodules in parallel. The `--filter=blob:none` flag
keeps the initial clone smaller and fetches file blobs on demand.
Recursive submodule clone checks out the recorded commits first; the
`git submodule foreach` step switches each initialized child repo to its local
`main` branch for day-to-day work.

If the repo is already cloned:

```bash
git submodule sync --recursive
git submodule update --init --recursive --jobs=8
pnpm run submodules:checkout-main
pnpm install
```

## CI Notes

- Workspace CI in this repo requires a `PACKAGES_PAT` Actions secret.
- That token must be able to read private GitHub repos and GitHub Packages for the `pylonline` org.
- The workspace repo itself can stay public without exposing private child-repo code. A public clone only sees submodule pointers and metadata unless the user has access to the private repos.

## Common Commands

```bash
pnpm run submodules:init
pnpm run submodules:checkout-main
pnpm run submodules:status
pnpm run check
pnpm run test
pnpm run lint
```

## Dependency Model

- `core-lint` is the shared tooling package used by `core-ui`, `portal`, and `pylon`.
- `core-ui` is the shared UI package used by `portal` and `pylon`.
- The long-term target is versioned package consumption plus workspace linking during local development.
- This repo is the local control plane, not the product-code monorepo.

See:

- [docs/README.md](docs/README.md) for the docs index and runbook entry points
- [docs/architecture/workspace/repo-map.md](docs/architecture/workspace/repo-map.md) for per-repo folder map and responsibilities
- [docs/architecture/workspace/workspace-packages.md](docs/architecture/workspace/workspace-packages.md) for workspace CI, package consumption, and generated-bundle behavior
- [docs/architecture/workspace/local-workspace-layout.md](docs/architecture/workspace/local-workspace-layout.md) for parent-folder layout guidance
- [docs/architecture/workspace/config-and-core-lint.md](docs/architecture/workspace/config-and-core-lint.md) for the `config/` folder and `core-lint` pattern
- [docs/architecture/workspace/naming-conventions.md](docs/architecture/workspace/naming-conventions.md) for shared file-prefix naming conventions
- [docs/runbooks/release/release-preflight.md](docs/runbooks/release/release-preflight.md) for the one-command release preflight workflow

5/20/2026
<img width="1096" height="355" alt="image" src="https://github.com/user-attachments/assets/673af168-0d99-45c3-bac5-64b3853c8def" />

4/25/2026
<img width="1081" height="364" alt="image" src="https://github.com/user-attachments/assets/e6595493-cd62-4622-91e4-9b0414b95d5c" />
