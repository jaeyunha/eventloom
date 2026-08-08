# Open Sessionboard Agent Guide

## Mission

Build and verify the product defined by `spec/open-sessionboard.md` and `prd.json`. Use the evidence corpus under `evidence/` when product behavior or visual treatment is unclear.

## Workflow

- Use GJC-native planning, implementation, and verification workflows only.
- Do not recreate legacy orchestration, build/inspect loops, watchdogs, or prompt runners.
- Keep the Forge repository private during development. Public visibility is a release-gate action.
- Preserve the clean-root repository history; make focused implementation commits after the baseline.
- Never expose secrets from `.env`, Cloudflare, Airtable, OpenSend, OAuth providers, or Accelevents.

## Architecture boundaries

- Next.js owns the browser UI; it does not become a second backend.
- Hono on Cloudflare Workers owns the application API.
- Airtable is authoritative for program business records.
- D1, Durable Objects, R2, and Queues own application state, coordination, files, and background work.
- Integrations are adapters behind explicit interfaces; tests must have deterministic fakes.
- All tenant-owned records and API access must enforce tenant isolation.

## Commands

- `make check` — typecheck, lint, and formatting checks
- `make test` — unit and integration tests
- `make test-e2e` — Playwright end-to-end tests
- `make all` — check and tests
- `make dev` — local web/API development

Run focused tests while editing and the full relevant gate before declaring a feature complete.

## Interaction QA

Use Ever for the regular browser acceptance loop. Use the `codex-cua` skill for exact visual and user-interaction checks, including CFP completion, speaker portal flows, admin review/scheduling, embeds, keyboard navigation, and failure states. Capture concrete evidence rather than relying on code inspection alone.

## Safety

Do not weaken or delete tests to make them pass. Do not commit `.env`, runtime state under `.gjc/`, Wrangler state, browser recordings containing secrets, or generated build output. Fix source defects and preserve unrelated user work.
