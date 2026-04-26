# Naming Map

This repo uses filename prefixes (not extra folders) to make related files easy to scan visually.

## Prefix Rules

- `public-*`: Public-facing route/page assets.
- `auth-*`: Authentication entry/flow pages.
- `legal-*`: Terms/privacy/cookie/legal pages.
- `secure-*`: Authenticated user-area pages.
- `admin-*`: Admin-only pages.
- `handlers*`: API route handler modules in `portal/src/api`.
- `integrations*`: External service adapters in `portal/src/lib`.
- `route-*`: Route-specific browser modules in `core-ui/assets/js`.
- `template-*`: Shared UI contract styles in `core-ui/assets/css/template-contract`.

## Directory Map

- `core-ui/pages`
  - Route HTML filenames use `public-*`, `auth-*`, `legal-*`, `secure-*`, `admin-*`.
- `portal/src/api`
  - Route handler modules use `handlers*` (for example: `handlersAuth.ts`).
- `portal/src/lib`
  - External adapters use `integrations*` (for example: `integrationsStripe.ts`).
- `core-ui/assets/js`
  - Route modules use `route-*` where route-specific behavior exists.
- `core-ui/assets/css`
  - Shared template contract styles live under `template-contract/` with `template-*` names.

## Examples

- `public-template.html`, `public-index.html`
- `auth-login.html`, `auth-registration.html`
- `legal-terms.html`, `legal-privacy-policy.html`
- `secure-settings.html`, `admin-dashboard.html`
- `handlersAdmin.ts`, `handlersSubscription.ts`
- `integrationsSms.ts`, `integrationsCloudflareDns.ts`
- `route-secure-settings.js`, `route-secure-messages.js`
- `template-card-app.css`, `template-card-not-found.css`

## Additions Checklist

When adding a new file:

1. Pick the prefix by functional domain first.
2. Keep route/file references in sync (imports, path maps, tests).
3. Prefer extending existing prefix groups over introducing new ad-hoc names.
