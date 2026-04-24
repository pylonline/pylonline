# Pylonline Workspace

This repository is the workspace and orchestration layer for the Pylonline codebase.

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

1. Clone the workspace repo.
2. Initialize submodules.
3. Install workspace dependencies with `pnpm`.

```bash
git clone --recurse-submodules https://github.com/pylonline/pylonline.git
cd pylonline
pnpm install
```

## CI Notes

- Workspace CI in this repo requires a `PACKAGES_PAT` Actions secret.
- That token must be able to read private GitHub repos and GitHub Packages for the `pylonline` org.
- The workspace repo itself can stay public without exposing private child-repo code. A public clone only sees submodule pointers and metadata unless the user has access to the private repos.

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

See:

- [docs/repo-map.md](/home/asta/pylonline/pylonline/docs/repo-map.md) for repo responsibilities and conventions
- [docs/notes/local-workspace-layout.md](/home/asta/pylonline/pylonline/docs/notes/local-workspace-layout.md) for parent-folder layout guidance
- [docs/notes/workspace-ci-and-shared-ui.md](/home/asta/pylonline-workspace/pylonline/docs/notes/workspace-ci-and-shared-ui.md) for CI, shared-package, and generated-bundle behavior
- [docs/notes/config-layout.md](/home/asta/pylonline-workspace/pylonline/docs/notes/config-layout.md) for the root-stub plus `config/` folder pattern

4/17/26
<img width="187" height="174" alt="image" src="https://github.com/user-attachments/assets/1c91f2e7-43e1-4a93-8e1f-3491f5a67d27" />
