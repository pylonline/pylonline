# Pylonline Workspace

This repository is the workspace and orchestration layer for the Pylonline codebase.

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

1. Clone the workspace repo with parallel, shallow submodules.
2. Initialize submodules.
3. Install workspace dependencies with `pnpm`.

```bash
git clone \
  --recurse-submodules \
  --shallow-submodules \
  --depth=1 \
  --filter=blob:none \
  --jobs=8 \
  https://github.com/pylonline/pylonline.git
cd pylonline
git submodule foreach --recursive 'git switch main'
pnpm install
```

The `--jobs=8` flag fetches submodules in parallel. The `--depth=1`,
`--shallow-submodules`, and `--filter=blob:none` flags keep the initial clone
small and fetch deeper history or file blobs only when needed.
Recursive submodule clone checks out the recorded commits first; the
`git submodule foreach` step switches each initialized child repo to its local
`main` branch for day-to-day work.

If you need full Git history for release archaeology, bisecting, or older
submodule commits, clone without the shallow flags.

## CI Notes

- Workspace CI in this repo requires a `PACKAGES_PAT` Actions secret.
- That token must be able to read private GitHub repos and GitHub Packages for the `pylonline` org.
- The workspace repo itself can stay public without exposing private child-repo code. A public clone only sees submodule pointers and metadata unless the user has access to the private repos.

If the repo is already cloned:

```bash
git submodule update --init --recursive --depth=1 --jobs=8
pnpm run submodules:checkout-main
pnpm install
```

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
- [docs/repo-map.md](docs/repo-map.md) for repo responsibilities and conventions
- [docs/notes/local-workspace-layout.md](docs/notes/local-workspace-layout.md) for parent-folder layout guidance
- [docs/notes/fast-clone.md](docs/notes/fast-clone.md) for faster clone and submodule checkout guidance
- [docs/notes/workspace-ci-and-shared-ui.md](docs/notes/workspace-ci-and-shared-ui.md) for CI, shared-package, and generated-bundle behavior
- [docs/notes/config-layout.md](docs/notes/config-layout.md) for the root-stub plus `config/` folder pattern
- [docs/notes/naming-map.md](docs/notes/naming-map.md) for shared file-prefix naming conventions
- [docs/runbooks/release-preflight.md](docs/runbooks/release-preflight.md) for the one-command release preflight workflow

4/25/2026
<img width="1081" height="364" alt="image" src="https://github.com/user-attachments/assets/e6595493-cd62-4622-91e4-9b0414b95d5c" />
