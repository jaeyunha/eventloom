# Eventloom Agent Guide

## Source precedence and status

- `spec/eventloom.md` is the product truth source for supported scope and status.
- The authoritative competition reference is `/Users/jaeyunha/dev/open-sessionboard/Kill-My-SaaS-Competition-Brief`. It is intentionally ignored by Git and may not exist inside worktrees; read it from that absolute path and treat it as read-only.
- Executable code/configuration and observed deployment behavior define what is currently running.
- `ARCHITECTURE.md` defines system boundaries. `docs/setup.md`, `docs/api.md`, `docs/calendar-semantics.md`, `docs/qa-runbook.md`, `docs/deployment-readiness.md`, and `docs/release-runbook.md` define operational procedures.
- `docs/llm-judge-runs.md` records evaluator evidence and its limitations. Incomplete, mocked, or diagnostic runs are not release evidence.

## Operating rules

- Keep work in the program-side product scope. The built-in Speaker CRM is supported scope; Accelevents is a separate external event-platform integration and is not a supported current feature.
- The canonical browser path is the Next.js same-origin `/api/*` gateway to the separately deployed Hono Worker. Do not put provider credentials or backend data access in the browser.
- Email/password, verified email, and magic-link authentication are supported. Google, Microsoft, and other social OAuth are not supported.
- Advisory AI uses OpenAI Responses through a backend-only key. A human must apply, edit, or reject every consequential suggestion. Provider configuration is not feature-verification evidence.
- Keep local, staging, and production provider resources and credentials isolated. Never expose secrets from environment files, Cloudflare, Airtable, OpenSend, or other providers.
- Treat repository evidence and local or mocked checks honestly; do not claim release verification without the applicable deployed workflow evidence.

## Architecture boundaries

- D1 is authoritative for program business records and operational state, including
  durable outbox, idempotency, audit, and optional-integration coordination.
- Airtable is an optional organization-scoped adapter: outbound projection is
  asynchronous, and selected inbound fields enter through validated domain commands.
  Airtable availability must never block ordinary product reads or writes.
- Durable Objects serialize tenant/event coordination and schedule mutations where
  ordered admission is required; D1 optimistic concurrency remains authoritative.
- R2 stores private files and artifacts behind authorization. One multiplexed Cloudflare Queue carries typed outbox work for communications, calendar, webhooks, and cache invalidation.
- The Hono Worker accepts HTTP fetches, Queue deliveries, and the production Cron Trigger. Sender and calendar identities temporarily use the verified legacy domain `sessionboard.namuh.co` during the Eventloom infrastructure migration.

## Commands

- `make dev` — run the local web and API applications.
- `make check` — typecheck, lint, and formatting checks.
- `make test` — unit and integration tests.
- `make test-e2e` — local Playwright end-to-end tests.
- `make all` — checks, unit/integration tests, and Playwright; it does not build deployables.

Run focused tests while editing and the full relevant gate before declaring source work complete. Release claims additionally require the deployed evidence defined by the QA and release runbooks.

## Concurrent worktree isolation

- Treat every development worktree as a separate local deployment. Never assume changing only `WEB_ORIGIN`, `API_URL`, or a listener port is sufficient.
- Keep each worktree's root `.env` as an independent regular file, not a symlink to another worktree. Preserve credentials, but give the worktree unique local runtime values.
- Use a unique `*.localhost` web hostname in addition to a unique web port. Browser cookies are scoped by hostname, not port, so two applications on `127.0.0.1` with different ports still share cookie scope.
- Assign distinct values for `WEB_PORT`, `API_PORT`, `API_INSPECTOR_PORT`, `COMPOSE_PROJECT_NAME`, `MAILPIT_SMTP_PORT`, `MAILPIT_HTTP_PORT`, and `OPENSEND_BRIDGE_PORT`.
- Keep `WEB_ORIGIN`, `NEXT_PUBLIC_APP_URL`, and local `BETTER_AUTH_URL` on the worktree's unique browser hostname. Keep `API_URL`, `API_ORIGIN`, and `API_UPSTREAM_ORIGIN` on the worktree's API listener.
- Give each worktree explicit `WRANGLER_PERSIST_TO` and `NEXT_DIST_DIR` paths. Local D1, Durable Object, R2, Queue, and Next.js cache state must not be shared with another worktree.
- Keep `apps/web/.env.local` aligned with the root `.env`; Next.js loads it and it can silently override the worktree API or web origin.
- Give Playwright ports and `PLAYWRIGHT_NEXT_DIST_DIR` values distinct from both the main worktree and the worktree's integrated dev servers. Fixture API persistence must remain ephemeral per run.
- Use the repository launchers rather than replacing them with hardcoded commands. Run `make db-local` before the first integrated start, `make dev` for the worktree stack, and `make test-e2e` for its isolated browser suite.
- Before claiming isolation, run main and worktree stacks concurrently and verify distinct listeners, Compose projects/volumes, Wrangler state paths, Next cache paths, same-origin API health, and browser cookie domains. Stop validation-only processes and retain only the intended local state.
- Local isolation does not create separate remote Airtable, OpenAI, OpenSend, Cloudflare, or other provider resources. Never use remote resources for worktree tests unless the task explicitly requires and authorizes them.
- The canonical variable matrix and example worktree profile are documented in `docs/setup.md`.

## Interaction QA

Use Ever for regular deployed-browser acceptance and the `codex-cua` skill for exact visual, keyboard, focus, form, dialog, drag/drop, responsive, and failure-state checks. Mocked routes and local Playwright results do not replace real staging or provider evidence.

## Repository and safety

- Forge and GitHub are intentional private mirrors. Keep both private until the release gate; retain Forge for competition-bonus eligibility. Do not describe Forge as the sole remote or either mirror as public before that gate.
- Preserve unrelated user work. Do not commit secrets, runtime state, Wrangler state, browser recordings containing secrets, or build output. Do not weaken or delete tests to make a check pass.
