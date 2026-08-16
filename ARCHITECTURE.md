# Eventloom Architecture

## Boundary diagram

The browser uses the Next.js application as its same-origin transport. Requests flow through the Next.js `/api/*` gateway to a separately deployed Hono Worker:

```text
browser
  -> Next.js web + same-origin /api/* gateway
  -> Hono API Worker
  -> D1 business + operational authority
     + Drizzle schema/query boundary
     + Durable Object coordination
     + R2 private files and artifacts
     + D1 outbox + Cloudflare Queue delivery
     + optional organization-scoped Airtable adapter
     + optional OpenAI Responses advisory provider
```

The gateway is the canonical browser path. API clients and provider callbacks may address the Worker API origin directly; the web application does not become a second backend.

## Deployable responsibilities

### Next.js web

Next.js renders the accessible organizer, speaker, and public-embed surfaces. Its `/api/[...path]` route forwards the browser method, query, cookies, and body to `API_UPSTREAM_ORIGIN`. The web deployment has no Airtable, D1, Durable Object, R2, Queue, or provider credentials.

### Hono API Worker

The Hono Worker is an independent Cloudflare deployment. It owns authentication, tenant authorization, request validation, business workflows, versioned API resources, webhooks, and integration orchestration. It exports three Cloudflare ingress handlers:

- `fetch` handles HTTP API requests, health checks, and callbacks.
- `queue` consumes persisted generic outbox jobs from the bound Cloudflare Queue.
- `scheduled` runs production Cron Trigger work; production is configured for `0 * * * *` scheduled reminders.

The exported runtime composes D1 repositories for supported product domains. Airtable-free startup is the normal path; legacy Airtable repository adapters remain in the tree for migration fixtures and compatibility tests, not as the default authority.

## Data and coordination boundaries

### D1 business and operational authority

Cloudflare D1 is the authoritative store for tenant, program, identity, and operational state: organizations and memberships; events, CFP, submissions, speakers, evaluations, sessions, and agenda; communications, reports, CRM, remix, and publication; authentication, API credentials, audit, idempotency, customer webhooks, integration state, and delivery coordination. Supported runtime repositories resolve these records from D1, and ordinary product traffic does not read Airtable or wait for it.

Speaker operations use one participant-centric D1 model. `participants` owns
event-scoped identity and source reconciliation; `speaker_profiles` owns event
speaker admission, profile data, lifecycle, travel details, and optimistic
versioning; `participant_grants` owns exact organization/event/participant/user
portal capabilities; `submission_participants` owns real CFP authorship and
speaker roles; and `session_speakers` owns program assignment and ordering.
Portal contexts are derived from active participant grants and narrowly scoped
CFP submission ownership rather than persisted as independent authorization.

The historical `speaker_roster`, `speaker_grants`, and persisted portal-context
tables are migration-only compatibility state. New runtime code does not read or
write them as speaker authority, create synthetic CFP submissions for manually
added speakers, or fall back to process-local caches when D1 capabilities are
absent. Airtable remains an optional asynchronous projection target and cannot
grant speaker access.

Production UI modules never embed event, submission, speaker, agenda, review, task, activity, date, or metric records as runtime fallbacks. Loading, unavailable, empty, and error states remain explicit until an authoritative API response arrives. Deterministic examples are permitted only in test-only modules and isolated fixture inputs with no production import path. Local fixture scenarios must drive the same domain services and transitions as the deployed runtime; they may not create contradictory repository snapshots, silently default missing event scope, or substitute browser-side demo data after an API failure.

Event creation and empty Agenda initialization commit in the same D1 batch. Every event
therefore has exactly one Agenda workspace from state/draft version 1 before rooms,
tracks, or sessions exist. `scripts/d1-airtable-migration/backfill-agendas/` repairs
older D1 events that predate this invariant using additive, idempotent inserts.

Mutable domain roots use stable application IDs, explicit organization/event scope, versions, and timestamps. Relational constraints and repository predicates enforce tenant ownership. Consequential workflows retain domain history or audit records and use compare-and-swap/version checks where concurrent edits matter.

### Drizzle ORM and migration boundary

`apps/api/src/db/schema/` is the typed SQLite schema boundary. `createDatabase()` wraps the injected Cloudflare `D1Database` with `drizzle-orm/d1`; repositories use Drizzle for typed CRUD where adopted and D1 prepared SQL/`DB.batch()` for complex or atomic statements. Drizzle does not open a second database.

Drizzle Kit reads that schema to generate, check, introspect, and inspect schema history. Generated artifacts under `apps/api/drizzle/` are review inputs; deployable schema history is the forward-only numbered SQL under `apps/api/migrations/`. Wrangler owns migration application and `d1_migrations`; `drizzle-kit push` is not the staging/production deployment path.

Local integrated development uses `wrangler dev` and the `DB` binding from `wrangler.toml`. Wrangler persists a local SQLite-backed D1 database, so local application code exercises the same D1 API and migrations rather than a separate `better-sqlite3` or PostgreSQL runtime.

### R2 private files

The `PRIVATE_FILES` R2 bucket stores private upload bytes and generated artifacts. D1 stores object keys, lifecycle/version metadata, authorization state, and audit references. API serializers remove internal object keys, and access is mediated by fresh authorization or expiring capabilities; an R2 object is not public merely because it exists.

### Durable Object coordination

`AgendaCoordinator` is addressed per organization/event and serializes agenda mutation admission. Its storage atomically checks an expected coordinator revision and records an idempotent operation receipt. The agenda engine and D1 repository remain responsible for domain state, versioning, and deterministic conflict validation; Durable Object storage is coordination state, not the business source of truth and is not transactionally coupled to D1.

### D1 outbox and Cloudflare Queue

Each environment binds one `OUTBOX_QUEUE` with a dead-letter queue. Generic side effects persist first in D1 `outbox_jobs`; Queue messages carry the job identity and topic for communications, calendar delivery, customer webhook delivery, or cache invalidation. The consumer conditionally claims the D1 row with a lease, validates the persisted payload, invokes the provider adapter, records delivery status/receipts, and transitions the row to delivered, retry, failed, or dead-letter state. Duplicate Queue delivery is therefore an idempotent wake-up, not the durable record.

Airtable projection uses its own durable `airtable_sync_jobs` state machine rather than the generic topic enum. Projection dispatcher/sweeper and version-2 Queue-message contracts are implemented, but the exported Worker currently composes only the generic version-1 outbox consumer and scheduled reminders. Airtable projection dispatch and consumption must be explicitly composed before it can be claimed as deployed runtime behavior.

### Optional organization-scoped Airtable adapter

Airtable is an optional per-organization integration, never a boot requirement, fallback database, or authority for authentication, authorization, decisions, publication, delivery, audit, idempotency, or private-file access. The control plane stores connection, OAuth attempt, encrypted credential reference, base/mapping, health, and sync state in D1. Organization owner/admin routes expose OAuth and PAT connection operations, base/mapping selection, pause/resume, retry, disconnect, conflict, and webhook surfaces. The routes are mounted only when the Airtable integration environment is configured; static `AIRTABLE_ACCESS_TOKEN`/`AIRTABLE_BASE_ID` support remains an optional compatibility/diagnostic path.

OAuth implements one-use, expiring state and PKCE attempt records plus leased token exchange/refresh semantics. PAT credentials use the same organization-scoped D1 connection model. Tokens remain server-side encrypted references and Airtable availability does not affect D1 domain commands.

### Outbound Airtable projection

Selected D1 repository mutations can insert deduplicated `airtable_sync_jobs` alongside domain/history changes. Projection workers claim jobs with owner/token leases, discard stale source versions, and upsert by stable `Application ID`; provider record IDs live only in mapping tables. Success updates the mapping and job through conditional completion. Retryable network, rate-limit, conflict, and server errors are rescheduled; terminal mapping errors fail visibly. Initial-export checkpoints, reconciliation, stale-mapping repair, expired-lease release, and Queue wake-up dispatch are implemented as adapter components.

Projection is asynchronous and one-way with respect to normal commands: no user-facing request synchronously dual-writes Airtable, and no product read falls back to Airtable. Because the projection dispatcher/worker is not yet wired into the exported `queue` or `scheduled` handlers, current implementation should be described as a built projection subsystem awaiting runtime composition, not as observed convergence in deployed environments.

### Controlled inbound Airtable changes

Inbound support is deliberately constrained. The implemented webhook boundary reads a bounded raw body, verifies `X-Airtable-Content-MAC` over the exact bytes, durably deduplicates the notification, and returns `204`. Cursor workers use owner/token leases and row-version compare-and-swap; a page's individual changes and cursor advance form one persistence boundary, and a payload-retention gap requests reconciliation rather than skipping data.

The change worker accepts only enabled projection fields with an existing application-ID mapping and registered translator. Export echoes, already-observed hashes, unchanged values, and disallowed fields become no-ops. An allowed value is applied through an idempotent, version-checked domain command, never by copying provider JSON directly into a D1 row. If D1 has changed since the mapping's last exported version, the worker records an open conflict instead of choosing a winner. Conflict records support idempotent `use_d1`, `use_airtable`, or manual resolution state transitions.

These webhook, cursor, change, and conflict components are implemented and tested in isolation, but the current organization integration composition still returns a `503` webhook response and placeholder conflict route results. Controlled inbound behavior is therefore not yet active through the exported Worker.

## Migration and authority cutover

The repository includes a forward-only Airtable-to-D1 migration toolchain:

- export captures Airtable schema/records, provider IDs, stable application IDs, and raw source evidence;
- import validates mappings and emits a deterministic dependency-ordered D1 import plan;
- canonical verification compares counts/hashes and requires unexplained drift to be resolved or explicitly recorded;
- cutover helpers enforce `shadow -> read-d1 -> write-d1`, require a clean verification report before D1 reads, and require a write fence for the final transition.

The checked-in import CLI currently validates and prints a plan; it explicitly does not write D1 without an injected execution adapter. Likewise, marker and fence adapters are injection boundaries rather than proof that a tenant has been cut over. Before `write-d1`, operators export, import, reconcile, shadow-read, acquire a short write fence, apply final deltas, and record the marker. A `read-d1` marker may roll back to `shadow`; after the first accepted D1-authoritative write, rollback to Airtable writes is prohibited. Recovery is forward repair from D1, with Airtable projection paused if necessary. Remote schema changes stay additive so the previous Worker can run against the expanded schema if deployment fails after migration.

The current default runtime is already D1-backed and Airtable-optional. D1 remains authoritative even when the optional Airtable integration is enabled. The migration/cutover tooling exists to move legacy organization data safely; documentation or a generated plan alone is not evidence that any remote dataset was imported, reconciled, or cut over.

## Authentication and product scope

Better Auth runs inside the Hono Worker and persists operational identity state in D1. Supported sign-in and identity flows are:

- email/password
- verified email
- email magic links

Google, Microsoft, and all other social OAuth providers are unsupported. Speaker and organizer permissions are tenant- and event-scoped; public embeds and feeds read only explicitly published projections.

The built-in Speaker CRM is an organization-scoped first-party contact system with search, import, tags/custom fields, segments, pipeline stages, notes/history, duplicate handling, explicit merges, and outreach through the shared communications boundary. Speaker portal profiles, rosters, files, and tasks remain separate event-scoped program records. Accelevents is a separate external event-platform integration and is not a supported current feature, dependency, or release gate.

## Integrations and advisory AI

- **OpenSend:** OpenSend is required by the current API runtime because the Worker composes authentication, communications, and calendar delivery through the configured endpoint. It uses deployment-owned, validated sender identities for authentication, speaker, and calendar mail. The current hosted defaults are `auth@sessionboard.namuh.co`, `speakers@sessionboard.namuh.co`, and `calendar@sessionboard.namuh.co`; these are not source-compiled requirements. Provider verification and environment-specific credentials are deployment concerns.
- **Calendar:** RFC 5545 `REQUEST`, `UPDATE`, and `CANCEL` messages use deployment-owned, validated UID-domain configuration, increasing `SEQUENCE`, and explicit IANA time zones. The current hosted default UID domain is `calendar.sessionboard.namuh.co`, with the calendar sender identity as organizer. Calendar-provider OAuth is not required. Agenda DST route errors are source-present and locally tested, with no deployed or staging evidence; automatic timezone migration and republish remain a known gap.
- **Delivery settings:** HTTP-triggered delivery and Cloudflare Queue delivery use the same deployment settings for the OpenSend endpoint, sender identities, calendar UID domain, credentials, and validation. Queue delivery changes transport and retry behavior, not provider identity or message configuration.
- **Public API and webhooks:** Versioned REST resources, scoped API keys, cursor pagination, idempotent writes, optimistic concurrency, and signed retryable webhooks expose only authorized or published data.
- **Optional advisory AI:** Set `AI_PROVIDER=disabled` or `AI_PROVIDER=openai`. OpenAI is optional only when disabled, and `OPENAI_API_KEY` is required when `AI_PROVIDER=openai`. AI is feature-scoped, not an application boot or seed prerequisite. A provider is called only after an authorized user requests an agenda proposal, evaluation assistance, or remix proposal. If that feature's provider is unavailable, non-AI workflows continue and the control/API reports an explicit unavailable state.
- **Provider and model selection:** Local, staging, and production use OpenAI Responses (`openai-responses`) with a backend-only `OPENAI_API_KEY`. Agenda uses `gpt-5.6-sol` at medium reasoning because placement quality is the hardest constraint-planning task; deterministic conflict validation remains authoritative. Evaluation uses `gpt-5.6-sol` at medium reasoning because rubric interpretation and cited evidence are consequential and quality-sensitive. Content remix uses `gpt-5.6-terra` at low reasoning because it needs strong bounded writing quality without Sol's cost/latency. `gpt-5.6-luna` is the low-cost high-volume candidate, but is not selected until representative remix/evaluation benchmarks show no material quality loss. The adapter uses `POST /v1/responses` with JSON output and per-feature provenance. Each deployed environment requires its own provider-managed secret.
- **Payload boundary:** Agenda requests contain the event and base draft/revision version, selected rooms, day/time windows, ordered rules, eligible session titles and scheduling fields, and existing agenda entries. Evaluation requests contain the selected rubric plus the submission title, abstract, and answers visible under the reviewer's projection. Remix requests contain only organizer-selected content fields and tone/guidance. Unselected private fields, credentials, and unrelated records are excluded.
- **Advisory result boundary:** Providers return typed, private candidates with provider/model provenance. Base versions and source revisions are checked again before any application; stale candidates are rejected. A human must review and explicitly apply, edit, or reject a candidate. AI never scores, decides, schedules, publishes, sends, exports, or overwrites source records by itself.
- **Evidence status:** Deterministic contract tests and opt-in synthetic checks have exercised the real OpenAI Responses adapter plus the local agenda proposal lifecycle. No deployed staging end-to-end AI workflow has been accepted. The 31.3% AI Agenda diagnostic is diagnostic only and is not validation or release evidence.

## Current hosting

Deployment origins and routes are operator configuration. Production sets
`workers_dev = false`, so self-hosted production environments must define all
four custom-domain route keys:

```dotenv
API_HOSTNAME=api.production.example.com
API_ZONE_NAME=production.example.com
WEB_HOSTNAME=web.production.example.com
WEB_ZONE_NAME=production.example.com
```

These are production examples. Each hostname must belong to its operator-owned
Cloudflare zone. The API preflight and API dry run render and validate the API
Worker configuration. The web deployment dry run renders and validates the
separate web Worker configuration. The public repository
does not publish a Cloudflare account, D1 identifiers, or an account-specific
`workers.dev` subdomain. Staging and production environment files supply their
own HTTPS web/API origins and resource IDs. A web custom-domain deployment also
supplies its route `pattern` and Cloudflare `zone_name`. The current hosted
`eventloom.namuh.co` route is only an example, not a self-hosting requirement.
Custom domains are recommended for stable production URLs. Sender and calendar identities use
`sessionboard.namuh.co` independently of web/API hosting.

## Repository policy

Forge and GitHub are intentional dual mirrors:

- Forge: `https://forge.smol.ai/jaeyunha/open-sessionboard`
- GitHub: `https://github.com/jaeyunha/eventloom`

Visibility is an operator-controlled publication action governed by
[`docs/public-release.md`](docs/public-release.md) and is independent from
deployed product release verification. Neither mirror is the sole repository.

## Invariants

- Every protected query and mutation is tenant-scoped and authorization-checked.
- Human decisions and explicit publication remain authoritative; advisory AI output is never consequential by itself, and provider availability is feature-scoped rather than a boot prerequisite.
- Side effects are idempotent, queued, retryable, observable, and auditable.
- Public projections contain only explicitly published fields; private files require fresh authorization.
- Secrets stay in environment/provider secret stores and never appear in API responses or evidence.
- Backend provider secrets stay in environment/provider secret stores and never appear in `NEXT_PUBLIC_*`, Wrangler variables, browser evidence, logs, API responses, or committed files.

## Documentation map

- Supported scope and current status: [`spec/eventloom.md`](spec/eventloom.md)
- Visual and interaction contract: [`DESIGN.md`](DESIGN.md)
- Environment and deployment setup: [`docs/setup.md`](docs/setup.md)
- Public API and webhooks: [`docs/api.md`](docs/api.md) and
  [`openapi/openapi.yaml`](openapi/openapi.yaml)
- Calendar lifecycle and timezone rules:
  [`docs/calendar-semantics.md`](docs/calendar-semantics.md)
- Configuration preflight: [`docs/deployment-readiness.md`](docs/deployment-readiness.md)
- Browser and accessibility acceptance: [`docs/qa-runbook.md`](docs/qa-runbook.md)
- Product release and competition submission gates:
  [`docs/release-runbook.md`](docs/release-runbook.md)
- Source-repository publication gate:
  [`docs/public-release.md`](docs/public-release.md)
- Evaluator history and limitations:
  [`docs/llm-judge-runs.md`](docs/llm-judge-runs.md)
- Source-repository evidence policy: [`evidence/README.md`](evidence/README.md)

This architecture document does not claim release verification. Advisory AI
remains partial until deployed real-provider end-to-end evidence is accepted.
