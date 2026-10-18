# Nastassia Saidak — Pylon Systems achievements

Living notes for the PDF/DOCX snapshot (`Nastassia Saidak Resume 2026 Pylon.pdf`, dated 2026-09-29). Update this file as the platform changes; regenerate the PDF when applying.

**Pylon Systems LLC — Owner / Principal Engineer — Feb 2026 – Present**

- Founded Pylon Systems and designed Pylonline, a subscription platform for self-hosted compute nodes, spanning 6 repositories and isolated databases across **asta**, **dev**, **stage**, and **prod**.
- Architected a serverless control plane on Cloudflare Workers and D1: **nine** Workers (public, private, privileged, identity, billing, monitor, dispatcher, logger, status). There is no product Worker; the three HTTP planes share product D1 and hop to owner Workers.
- Domain D1 via `dbFor(env, domain)` — identity, payments, product, dispatcher, monitor, logger, status. No shared `env.DB` fallback.
- Built Pylon, an offline-first Node.js node runtime with Docker orchestration, WebSocket messaging, and heartbeat reporting to the cloud portal.
- Auth and integrations: passkeys (WebAuthn), OTP, OAuth, sessions, RBAC and audit, Stripe, Resend, Google Calendar.
- CI/CD: per-Worker GitHub Actions (unit, API, UI, perf), gated deploys and rollback.
- AI-assisted development with domain-scoped agents, architecture docs, and operator runbooks.

Cisco and education bullets in the PDF are unchanged.
