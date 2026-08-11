# Open Sessionboard Architecture

## Boundary diagram

The browser uses the Next.js application as its same-origin transport. Requests flow through the Next.js `/api/*` gateway to a separately deployed Hono Worker:

```text
browser
  -> Next.js web + same-origin /api/* gateway
  -> Hono API Worker
  -> Airtable business authority
     + D1 operational state/outbox/audit
     + Durable Object coordination
     + R2 private files
     + one multiplexed Cloudflare Queue
     + optional advisory AI provider (Workers AI in staging/production; OpenAI Responses when explicitly configured)
```

The gateway is the canonical browser path. API clients and provider callbacks may address the Worker API origin directly; the web application does not become a second backend.

## Deployable responsibilities

### Next.js web

Next.js renders the accessible organizer, speaker, and public-embed surfaces. Its `/api/[...path]` route forwards the browser method, query, cookies, and body to `API_UPSTREAM_ORIGIN`. The web deployment has no Airtable, D1, Durable Object, R2, Queue, or provider credentials.

### Hono API Worker

The Hono Worker is an independent Cloudflare deployment. It owns authentication, tenant authorization, request validation, business workflows, versioned API resources, webhooks, and integration orchestration. It exports three Cloudflare ingress handlers:

- `fetch` handles HTTP API requests, health checks, and callbacks.
- `queue` consumes the single multiplexed outbox Queue.
- `scheduled` runs production Cron Trigger work; production is configured for `0 * * * *` scheduled reminders.

## Data and coordination boundaries

### Airtable business authority

Airtable is authoritative for tenant and program business records: organizations, events, forms and fields, submissions, participants and speaker profiles, reviews and decisions, tasks, sessions, rooms, tracks, agenda revisions, portal resources, file metadata, message templates, report definitions/runs, and publication-facing business records. Airtable record IDs are provider details; stable application IDs remain part of the application contract.

### D1 operational state

Cloudflare D1 stores operational state that needs transactional, retryable, or local coordination semantics rather than business authority:

- Better Auth accounts, sessions, verification tokens, and identity state
- organization/API credentials, idempotency keys, and request receipts
- durable outbox jobs, delivery attempts, retry/dead-letter state, and integration receipts
- private-upload lifecycle metadata and audit events

D1 does not replace Airtable as the source of program truth.

### Durable Objects

The `AgendaCoordinator` Durable Object serializes tenant/event mutations, agenda revisions, schedule locks, conflict checks, and monotonic calendar sequence allocation. It coordinates concurrent writes; it is not a business-record store.

### R2 private files

R2 stores private uploads and export artifacts. Objects are addressed through authorized, expiring access and never become public merely because they exist in a bucket. File lifecycle and audit metadata remain operational state in D1 and business references remain in Airtable.

### One multiplexed Queue

Each environment binds one `OUTBOX_QUEUE`. Typed messages multiplex communications, calendar delivery, webhook delivery, and cache invalidation through that queue. D1 outbox records provide deduplication, leases, retry state, delivery attempts, and auditability; a provider side effect is not considered complete until its receipt is recorded.

## Authentication and product scope

Better Auth runs inside the Hono Worker and persists operational identity state in D1. Supported sign-in and identity flows are:

- email/password
- verified email
- email magic links

Google, Microsoft, and all other social OAuth providers are unsupported. Speaker and organizer permissions are tenant- and event-scoped; public embeds and feeds read only explicitly published projections.

The built-in Speaker CRM is an organization-scoped first-party contact system with search, import, tags/custom fields, segments, pipeline stages, notes/history, duplicate handling, explicit merges, and outreach through the shared communications boundary. Speaker portal profiles, rosters, files, and tasks remain separate event-scoped program records. Accelevents is a separate external event-platform integration and is not a supported current feature, dependency, or release gate.

## Integrations and advisory AI

- **OpenSend:** The API sends through `https://opensend.namuh.co` using `auth@sessionboard.namuh.co`, `speakers@sessionboard.namuh.co`, and `calendar@sessionboard.namuh.co`. Provider verification and environment-specific credentials are deployment concerns.
- **Calendar:** RFC 5545 `REQUEST`, `UPDATE`, and `CANCEL` messages use UIDs under `calendar.sessionboard.namuh.co`, increasing `SEQUENCE`, explicit IANA time zones, and organizer `calendar@sessionboard.namuh.co`. Calendar-provider OAuth is not required.
- **Public API and webhooks:** Versioned REST resources, scoped API keys, cursor pagination, idempotent writes, optimistic concurrency, and signed retryable webhooks expose only authorized or published data.
- **Optional advisory AI:** AI is feature-scoped, not an application boot or seed prerequisite. A provider is called only after an authorized user requests an agenda proposal, evaluation assistance, or remix proposal. If that feature's provider is unavailable, non-AI workflows continue and the control/API reports an explicit unavailable state.
- **Provider selection:** Current staging and production are explicitly pinned to Cloudflare Workers AI (`cloudflare-workers-ai`). Local development or a future deployed environment may select OpenAI Responses (`openai-responses`) with `AI_PROVIDER=openai`, `OPENAI_MODEL`, and a backend-only `OPENAI_API_KEY`. OpenAI adapters use `POST /v1/responses`, request JSON mode under `text.format`, and extract raw REST text from `output[].content[]` entries with `output_text`.
- **Payload boundary:** Agenda requests contain the event and base draft/revision version, selected rooms, day/time windows, ordered rules, eligible session titles and scheduling fields, and existing agenda entries. Evaluation requests contain the selected rubric plus the submission title, abstract, and answers visible under the reviewer's projection. Remix requests contain only organizer-selected content fields and tone/guidance. Unselected private fields, credentials, and unrelated records are excluded.
- **Advisory result boundary:** Providers return typed, private candidates with provider/model provenance. Base versions and source revisions are checked again before any application; stale candidates are rejected. A human must review and explicitly apply, edit, or reject a candidate. AI never scores, decides, schedules, publishes, sends, exports, or overwrites source records by itself.
- **Evidence status:** Deterministic tests cover both provider contracts, and opt-in synthetic checks have exercised the real OpenAI Responses adapter plus the local agenda proposal lifecycle. No real deployed staging end-to-end AI workflow has been accepted. The 31.3% AI Agenda diagnostic is diagnostic only and is not validation or release evidence.

## Current hosting

The current staging Workers origins are:

- Web: `https://open-sessionboard-web-staging.ashleyha0317.workers.dev`
- API: `https://open-sessionboard-api-staging.ashleyha0317.workers.dev`

The current production Workers origins are:

- Web: `https://open-sessionboard-web-production.ashleyha0317.workers.dev`
- API: `https://open-sessionboard-api-production.ashleyha0317.workers.dev`

These pinned `workers.dev` origins are the current hosts. `https://sessionboard.namuh.co` for web and `https://api.sessionboard.namuh.co` for API are recommended stable custom domains, but they remain pending and unconfigured. Sender and calendar identities already use `sessionboard.namuh.co`, independently of web/API hosting.

## Repository policy

Forge and GitHub are intentional dual private mirrors:

- Forge: `https://forge.smol.ai/jaeyunha/open-sessionboard`
- GitHub: `https://github.com/jaeyunha/open-sessionboard`

Both remain private until the release gate passes. Forge is retained for competition-bonus eligibility. Neither mirror is the sole repository mirror or public before that gate.

## Invariants and status pointers

- Every protected query and mutation is tenant-scoped and authorization-checked.
- Human decisions and explicit publication remain authoritative; advisory AI output is never consequential by itself, and provider availability is feature-scoped rather than a boot prerequisite.
- Side effects are idempotent, queued, retryable, observable, and auditable.
- Public projections contain only explicitly published fields; private files require fresh authorization.
- Secrets stay in environment/provider secret stores and never appear in API responses or evidence.
- Backend provider secrets stay in environment/provider secret stores and never appear in `NEXT_PUBLIC_*`, Wrangler variables, browser evidence, logs, API responses, or committed files.

For supported scope and current status, read [`spec/open-sessionboard.md`](spec/open-sessionboard.md). For executable procedures, use [`docs/setup.md`](docs/setup.md), [`docs/deployment-readiness.md`](docs/deployment-readiness.md), [`docs/qa-runbook.md`](docs/qa-runbook.md), and [`docs/release-runbook.md`](docs/release-runbook.md). Evaluator outcomes and limitations are recorded in [`docs/llm-judge-runs.md`](docs/llm-judge-runs.md); this architecture document does not claim release verification. Advisory AI remains partial until deployed, real-provider end-to-end evidence is accepted.
