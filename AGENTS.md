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

- `/page-about`, `/page-cookie-popup`, `/page-support-inbox`, `/page-consultation`, `/page-subscription`, `/page-service-requests`
- `/element-footer`, `/element-table-scrollbar`, `/element-table`
- `/service-account`, `/service-newsletter`, `/service-consultation`, `/service-subscription`, `/service-billing`

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
| `page-subscription`, `page-service-requests`, `page-downloads`, `page-messages`, `page-support-inbox`, `page-docs`, `page-app`, `page-dashboard` | `/portal/secure/private/…` |
| `page-communication`, `page-administration`, `page-database`, `page-metrics`, `page-audit`, `page-logs`, `page-api` | `/portal/secure/privileged/…` |
| `page-settings`, `page-maintenance`, `page-cookie-popup` | `/portal/secure/private/account/settings`, `/maintenance`, cookie overlay |

| Element agents | Owns |
|----------------|------|
| `element-text-input`, `element-checkbox`, `element-button`, `element-card`, `element-table`, `element-tabs`, `element-popup`, `element-toast`, `element-calendar` | Shared fields, actions, cards, tables, tablists, modals, toasts, date/time pickers |
| `element-table-scrollbar`, `element-page-scrollbar` | Inline table/cookie rails vs document `.page-scrollbar` |
| `element-banner`, `element-menu`, `element-footer` | Shared banners, drawer, site footer |

| Service agents | Owns |
|----------------|------|
| `service-newsletter` | Subscribe/unsubscribe, admin campaigns (`/api/admin/communication/*` and `/api/admin/newsletter/*`) |
| `service-messages` | Member messages + public/secure support + admin support inbox |
| `service-consultation` | Booking/Calendar; admin assign/accept/reject/cancel/reschedule/sync |
| `service-subscription` | Plans, **entitlements**, checkout, install codes, subdomain policy (tiers `lifetime`/`basic`/`pro`) |
| `service-billing` | Payment methods, setup intents, shared Stripe webhook ingress (not plan lifecycle) |
| `service-auth`, `service-account` | Sign-in/session/OTP/passkeys/OAuth; profile/privacy/devices/cookies |
| `service-maintenance`, `service-downloads`, `service-email` | Status/windows; secure files; Resend |
| `service-database`, `service-observability` | Admin D1 browser APIs; metrics/audit/logs APIs (logger Worker: tail → `worker_log_events`) |

### Notes

- **Entitlements** stay under `service-subscription` + `page-subscription` (spec: [subscription-entitlements.md](docs/architecture/portal/subscription-entitlements.md)). No separate monitor agent until register HTTP exists.
- Test manifests are one per Worker: `portal/tests/manifests/<worker>.json` (`public`, `private`, `privileged`, `identity`, `billing`, `dispatcher`, `monitor`, `logger`, `status`), enforced by `tests/unit/workers/worker-manifests.test.ts`. Service agents map onto Workers: `service-auth`/`service-account` security ↔ `identity`, `service-billing` ↔ `billing`, `service-email` + notify producers ↔ `dispatcher`, `service-observability` ↔ `logger`, `service-messages`/`service-subscription` ↔ `private` (admin inbox ↔ `privileged`), `service-consultation` ↔ `public` + `privileged`. Run with `npm run test:worker:<worker>` from `portal/`.

## Backend and non-UI

- **API, handlers, D1** → `portal/src/api/`, `portal/src/db/` (see [portal/README.md](portal/README.md))
- **Shared lint/format config** → `core-lint`, [docs/architecture/workspace/config-and-core-lint.md](docs/architecture/workspace/config-and-core-lint.md)

## Architecture index

[docs/architecture/README.md](docs/architecture/README.md) — design and conventions.

[docs/runbooks/](docs/runbooks/) — operator procedures (release, deploy, QA checklists).

## Tests

- **Local ports:** the operator's `npm run dev:stack` owns `127.0.0.1:8788`–`8798` (Workers, D1 browser `8797`, readiness gate `8798`). Never start test Workers there — `test:api` frees its ports first and would kill stack Workers. Use `npm run test:pr:api` (picks `8801`+), or `PORT` / `PORTAL_PUBLIC_PEER_PORT` ≥ `8801`, or `PORTAL_API_SKIP_WRANGLER=1` against the running stack.
- After CSS boundary changes, run relevant unit tests under `portal/tests/unit/css/`.
- Per-Worker suites: `npm run test:worker:public|private|privileged|identity|billing|dispatcher|monitor|logger|status|all` (from `portal/`).
- Portal test matrix and commands: **[docs/runbooks/portal/portal-test-plan/](docs/runbooks/portal/portal-test-plan/)**; quick reference in [portal/README.md](portal/README.md) (`pnpm run test:unit`, `test:api`, `test:ui`).
