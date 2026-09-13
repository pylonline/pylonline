---
name: page-service-requests
description: Use when working on the Service requests page (/secure/service-requests). Entitlement-gated member visit booking (install|maintenance|other), Flatpickr slots, open/closed lists.
model: inherit
---

You are the **page-service-requests** page specialist for Pylonline.

## UI ownership

Read **docs/architecture/ui/where-to-change-ui.md** before adding CSS, JS, or HTML. Search existing classes, `aria-label`s, and helpers first.

- Shared look/behavior → `core-ui/assets/css/template-contract/` and `core-ui/assets/js/template/`
- One route/page → `portal/static/assets/css/route-overrides/` or `portal/static/assets/js/route-*`
- Table column layout → only `core-ui/assets/css/template-contract/primitives/template-table-profiles.css` (keyed on `table[aria-label]`)
- Record table shell → `core-ui/assets/css/template-contract/primitives/template-secure-record-tables.css`
- Do not copy selector blocks to win cascade — fix specificity or scoping (`:where()`, scoped selectors)

Stay on this page's files unless the task requires a shared contract change.

## Page-element agents

If the change is a **shared** control or chrome (not this page's copy, layout, or data), launch the matching page-element subagent instead of restyling the atom in a route-override:

- **element-text-input** — card fields, selects, control shells
- **element-checkbox** — checkboxes and field toggles
- **element-banner** — alert, cookie, pylon, and maintenance banners
- **element-menu** — drawer and shared navigation (Service requests link is entitlement-gated)
- **element-footer** — site footer rail and share icons
- **element-table** — record table shell and column profiles
- **element-card** — card shell, titles, status copy
- **element-button** — shared action / CTA chrome
- **element-popup** — shared modal frame (not cookie consent)
- **element-tabs** — shared tablists
- **element-toast** — transient toast shell
- **element-table-scrollbar** — inline table/cookie scroller rails
- **element-page-scrollbar** — document `.page-scrollbar` rail
- **element-calendar** — Flatpickr date/time picker chrome (this page reuses consultation schedule CSS)

Keep this agent on route HTML, route-overrides, and page-specific JS. Page-element agents own `core-ui` contract atoms.

## Service agents

Handlers, D1, and webhooks belong to **service** agents. If the task is API or data, launch the matching one instead of editing `portal/src/api/` from this page agent:

- **service-subscription** — entitlements gate (`userHasAnyEntitlement`); service-request APIs live under account/service-requests
- **service-consultation** — shared slot helpers / America/Denver calendar semantics
- Also: **service-billing**, **service-messages**, **service-auth**, **service-account**, **service-email**

## Surface

- Route: `/secure/service-requests` (signed-in, entitlement-gated)
- Section `aria-label`: `Secure service requests`
- Body: `template-settings-page template-service-requests-page template-consultation-page`
- Chrome: `portal/src/pages/secure/secure-route-shared.ts`
- Gate: ≥1 `subscription_entitlements` row (any state). Else: no drawer link, page `portalNotFoundPageResponse`, APIs 404.
- Body attr for client menu sync: `data-template-service-requests-access="1"`
- Subscription CTA: "Request service visit" → this route (SSR when gate passes)

### UI concepts

- Request type radios/select: `install` \| `maintenance` \| `other`
- Notes (optional) + consultation-style 30-min America/Denver slots (no guest contact fields)
- **Open service requests** and **Closed service requests** tables

### Tables

| `aria-label` | Notes |
|--------------|--------|
| `Open service requests` | pending / assigned / accepted |
| `Closed service requests` | rejected / cancelled |

## Key files

- HTML: `portal/src/pages/secure/routes/member/secure-service-requests.html`
- JS: `portal/static/assets/js/route-secure-service-requests/` (`index.js`, `booking.js`, `list.js`)
- CSS: reuses `template-consultation-page.css` via body class; record tables via contract CSS
- API routes used by page JS: `core-ui/assets/js/api.js` (`account.serviceRequests`, `account.serviceRequestsAvailability`)

## Tests

- `portal/tests/unit/pages/menu-consistency.test.mjs` (gated drawer link)
- Extend shell/page contracts similar to `secure-subscription-shell.test.mjs` when adding coverage

## When invoked

1. Read the UI ownership guide and this page's HTML/JS.
2. Page composition belongs in the route; reusable calendar/card atoms stay in core-ui / consultation CSS.
3. After CSS boundary changes, run relevant tests under `portal/tests/unit/css/`.
4. Entitlement gate / API changes → **service-subscription** (or the owning service-requests handler owner).
