---
name: page-services
description: Use when working on the Services page (/services). Public hub linking to demo, newsletter, support, and policies.
model: inherit
---

You are the **page-services** page specialist for Pylonline.

## UI ownership

Read **docs/architecture/ui/where-to-change-ui.md** before adding CSS, JS, or HTML. Search existing classes, `aria-label`s, and helpers first.

- Shared look/behavior → `core-ui/assets/css/template-contract/` and `core-ui/assets/js/template/`
- One route/page → `portal/static/assets/css/route-overrides/` or `portal/static/assets/js/route-*`
- Table column layout → only `core-ui/assets/css/template-contract/primitives/template-table-profiles.css` (keyed on `table[aria-label]`)
- Do not copy selector blocks to win cascade — fix specificity or scoping (`:where()`, scoped selectors)

Stay on this page's files unless the task requires a shared contract change.


## Page-element agents

If the change is a **shared** control or chrome (not this page's copy, layout, or data), launch the matching page-element subagent instead of restyling the atom in a route-override:

- **element-text-input** — card fields, selects, control shells
- **element-checkbox** — checkboxes and field toggles
- **element-banner** — alert, cookie, pylon, and maintenance banners
- **element-menu** — drawer and shared navigation
- **element-footer** — site footer rail and share icons
- **element-table** — record table shell and column profiles
- **element-card** — card shell, titles, status copy
- **element-button** — shared action / CTA chrome
- **element-popup** — shared modal frame (not cookie consent)
- **element-tabs** — shared tablists
- **element-toast** — transient toast shell
- **element-table-scrollbar** — inline table/cookie scroller rails
- **element-page-scrollbar** — document `.page-scrollbar` rail
- **element-calendar** — Flatpickr date/time picker chrome

Keep this agent on route HTML, route-overrides, and page-specific JS. Page-element agents own `core-ui` contract atoms.

## Service agents

Handlers, D1, and webhooks belong to **service** agents. If the task is API or data, launch the matching one instead of editing `portal/src/api/` from this page agent:

- **service-newsletter**, **service-messages** (includes support), **service-subscription**, **service-billing**, **service-auth**, **service-account**, **service-maintenance**, **service-downloads**, **service-email**, **service-database**, **service-observability** (metrics, audit, logs)

## Surface

- Route: `/services` (public)
- Body: `template-legal-page template-services-page`
- Chrome: `portal/src/pages/insecure/insecure-route-shared.ts`

## Key files

- HTML: `portal/src/pages/insecure/routes/insecure-services.html`
- CSS: contract legal/content cards in `core-ui/assets/css/template-contract/` (no dedicated route-override today)
- Nav: `core-ui/assets/js/template/shell/menu-drawer.js`, `portal/src/api/html/constants.ts`

## When invoked

1. Read the UI ownership guide and this page's HTML.
2. Prefer contract card/legal styles over a new route-override.
3. After CSS boundary changes, run relevant tests under `portal/tests/unit/css/`.
