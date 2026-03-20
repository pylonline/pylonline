# Pylonline Workspace

This repository is the workspace and orchestration layer for the Pylonline codebase.

It is not the source-of-truth repo for app code. The source-of-truth lives in these child repos:

- `core-lint`
- `core-ui`
- `portal`
- `pylon`

Those repos are tracked here as Git submodules so the workspace can pin a known-good combination of commits.

## Layout

```text
pylonline/
  core-lint/   # shared lint/format/package-quality tooling
  core-ui/     # shared UI assets, pages, and sync helpers
  portal/      # portal app
  pylon/       # pylon app
  docs/        # workspace notes and repo map
```

## What Lives Here

- `pnpm-workspace.yaml`
- workspace-level `package.json`
- shared local-install topology
- submodule pointers for the four child repos
- workspace docs and ramp-up notes

## What Does Not Live Here

- product source copied out of child repos
- top-level app builds checked into this repo
- committed `node_modules`
- disposable caches

## Bootstrap

1. Clone the workspace repo.
2. Initialize submodules.
3. Install workspace dependencies with `pnpm`.

```bash
git clone --recurse-submodules https://github.com/pylonline/pylonline.git
cd pylonline
pnpm install
```

If the repo is already cloned:

```bash
git submodule update --init --recursive
pnpm install
```

## Common Commands

```bash
pnpm run submodules:init
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

See [docs/repo-map.md](/home/asta/pylonline/pylonline/docs/repo-map.md) for the current repo responsibilities and conventions.
