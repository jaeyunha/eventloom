# Open Sessionboard Agent Guide

## Source precedence and status

- `spec/open-sessionboard.md` is the product truth source for supported scope and status.
- Executable code/configuration and observed deployment behavior define what is currently running.
- `ARCHITECTURE.md` defines system boundaries. `docs/setup.md`, `docs/api.md`, `docs/calendar-semantics.md`, `docs/qa-runbook.md`, `docs/deployment-readiness.md`, and `docs/release-runbook.md` define operational procedures.
- `docs/llm-judge-runs.md` records evaluator evidence and its limitations. Incomplete, mocked, or diagnostic runs are not release evidence.

## Operating rules

- Keep work in the program-side product scope. The built-in Speaker CRM is supported scope; Accelevents is a separate external event-platform integration and is not a supported current feature.
- The canonical browser path is the Next.js same-origin `/api/*` gateway to the separately deployed Hono Worker. Do not put provider credentials or backend data access in the browser.
- Email/password, verified email, and magic-link authentication are supported. Google, Microsoft, and other social OAuth are not supported.
- Workers AI is advisory only. A human must apply, edit, or reject any consequential suggestion before it affects business records, publication, communications, or exports.
- Keep local, staging, and production provider resources and credentials isolated. Never expose secrets from environment files, Cloudflare, Airtable, OpenSend, or other providers.
- Treat repository evidence and local or mocked checks honestly; do not claim release verification without the applicable deployed workflow evidence.

## Architecture boundaries

- Airtable is authoritative for program business records.
- D1 owns operational state, durable outbox, idempotency, and audit records; Durable Objects serialize tenant/event coordination and schedule mutations.
- R2 stores private files and artifacts behind authorization. One multiplexed Cloudflare Queue carries typed outbox work for communications, calendar, webhooks, and cache invalidation.
- The Hono Worker accepts HTTP fetches, Queue deliveries, and the production Cron Trigger. Sender and calendar identities use `sessionboard.namuh.co`.

## Commands

- `make dev` — run the local web and API applications.
- `make check` — typecheck, lint, and formatting checks.
- `make test` — unit and integration tests.
- `make test-e2e` — local Playwright end-to-end tests.
- `make all` — checks, unit/integration tests, and Playwright; it does not build deployables.

Run focused tests while editing and the full relevant gate before declaring source work complete. Release claims additionally require the deployed evidence defined by the QA and release runbooks.

## Interaction QA

Use Ever for regular deployed-browser acceptance and the `codex-cua` skill for exact visual, keyboard, focus, form, dialog, drag/drop, responsive, and failure-state checks. Mocked routes and local Playwright results do not replace real staging or provider evidence.

## Repository and safety

- Forge and GitHub are intentional private mirrors. Keep both private until the release gate; retain Forge for competition-bonus eligibility. Do not describe Forge as the sole remote or either mirror as public before that gate.
- Preserve unrelated user work. Do not commit secrets, runtime state, Wrangler state, browser recordings containing secrets, or build output. Do not weaken or delete tests to make a check pass.
