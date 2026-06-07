# Agent guide (Pylonline workspace)

## Workspace layout

Multi-repo workspace (submodules). Per-repo folders: **[docs/architecture/workspace/repo-map.md](docs/architecture/workspace/repo-map.md)**.

## UI and frontend

Start here: **[docs/architecture/ui/where-to-change-ui.md](docs/architecture/ui/where-to-change-ui.md)**

- **core-ui** — shared template contract (CSS, JS, HTML partials)
- **portal** — product routes, API, route-specific CSS/JS overrides
- **Do not duplicate** table profiles, card atoms, or template widgets across tiers

## Backend and non-UI

- **API, handlers, D1** → `portal/src/api/`, `portal/src/db/` (see [portal/README.md](portal/README.md))
- **Shared lint/format config** → `core-lint`, [docs/architecture/workspace/config-and-core-lint.md](docs/architecture/workspace/config-and-core-lint.md)

## Architecture index

[docs/architecture/README.md](docs/architecture/README.md) — design and conventions.

[docs/runbooks/](docs/runbooks/) — operator procedures (release, deploy, QA checklists).

## Tests

- After CSS boundary changes, run relevant unit tests under `portal/tests/unit/css/`.
- Portal test matrix and commands: **[docs/runbooks/portal/portal-test-plan/](docs/runbooks/portal/portal-test-plan/)**; quick reference in [portal/README.md](portal/README.md) (`pnpm run test:unit`, `test:runtime`, `test:api`, `test:ui`).
