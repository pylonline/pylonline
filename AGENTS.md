# Agent guide (Pylonline workspace)

## Workspace layout

Multi-repo workspace (submodules). Per-repo folders: **[docs/architecture/workspace/repo-map.md](docs/architecture/workspace/repo-map.md)**.

## UI and frontend

Start here: **[docs/architecture/ui/where-to-change-ui.md](docs/architecture/ui/where-to-change-ui.md)**

- **core-ui** — shared template contract (CSS, JS, HTML partials)
- **portal** — product routes, API, route-specific CSS/JS overrides
- **Do not duplicate** table profiles, card atoms, or template widgets across tiers

## Page and page-element specialists (Cursor subagents)

Cursor only loads `*.md` at the **root** of **[`.cursor/agents/`](.cursor/agents/)** (no subfolders, no README). Grouping is the filename prefix. The YAML `name` **matches the filename** (without `.md`).

Invoke with the filename:

- `/page-about`, `/page-cookie-popup`, `/page-support-inbox`, `/page-consultation`
- `/element-footer`, `/element-table-scrollbar`
- `/service-account`, `/service-newsletter`, `/service-consultation`

| Prefix | Role |
|--------|------|
| **`page-*.md`** | One agent per route/surface |
| **`element-*.md`** | Shared UI atoms |
| **`service-*.md`** | API + D1 domains |

Page agents **delegate** shared-atom work to element agents and **handlers/D1** to service agents.

| Page agents | Route |
|-------|--------|
| `page-home`, `page-services`, `page-newsletter`, `page-support`, `page-consultation`, `page-about`, `page-demo`, `page-faq` | `/`, `/services`, `/newsletter`, `/support`, `/consultation`, `/about`, `/demo`, `/faq` |
| `page-sign-in`, `page-sign-up`, `page-registration`, `page-verification`, `page-password-recovery` | `/signin`, `/signup`, `/registration`, verify family, forgot/reset |
| `page-legal`, `page-not-found` | `/terms` and other policies, `/not-found` |
| `page-subscription`, `page-downloads`, `page-messages`, `page-support-inbox`, `page-docs`, `page-app`, `page-dashboard` | `/secure/…` |
| `page-communication`, `page-administration`, `page-database`, `page-metrics`, `page-audit`, `page-logs`, `page-api` | `/secure/admin/…` |
| `page-settings`, `page-maintenance`, `page-cookie-popup` | `/secure/settings`, `/maintenance`, cookie overlay |

| Element agents | Owns |
|----------------|------|
| `element-text-input`, `element-checkbox`, `element-button`, `element-card`, `element-table`, `element-tabs`, `element-popup`, `element-toast`, `element-calendar` | Shared fields, actions, cards, tables, tablists, modals, toasts, date/time pickers |
| `element-table-scrollbar`, `element-page-scrollbar` | Inline table/cookie rails vs document `.page-scrollbar` |
| `element-banner`, `element-menu`, `element-footer` | Shared banners, drawer, site footer |

| Service agents | Owns |
|----------------|------|
| `service-newsletter`, `service-messages`, `service-consultation`, `service-subscription`, `service-billing` | List/campaigns; messages+support; consultation booking/Calendar; plans/checkout; payment methods and non-plan charges |
| `service-auth`, `service-account` | Sign-in/session/OTP; profile/privacy/devices/cookies |
| `service-maintenance`, `service-downloads`, `service-email` | Status/windows; secure files; Resend |
| `service-database`, `service-observability` | Admin D1 browser APIs; metrics/audit/logs APIs |

## Backend and non-UI

- **API, handlers, D1** → `portal/src/api/`, `portal/src/db/` (see [portal/README.md](portal/README.md))
- **Shared lint/format config** → `core-lint`, [docs/architecture/workspace/config-and-core-lint.md](docs/architecture/workspace/config-and-core-lint.md)

## Architecture index

[docs/architecture/README.md](docs/architecture/README.md) — design and conventions.

[docs/runbooks/](docs/runbooks/) — operator procedures (release, deploy, QA checklists).

## Tests

- After CSS boundary changes, run relevant unit tests under `portal/tests/unit/css/`.
- Portal test matrix and commands: **[docs/runbooks/portal/portal-test-plan/](docs/runbooks/portal/portal-test-plan/)**; quick reference in [portal/README.md](portal/README.md) (`pnpm run test:unit`, `test:runtime`, `test:api`, `test:ui`).
