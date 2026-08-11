# Open Sessionboard

Open Sessionboard is an open-source, program-side Sessionboard alternative for event-production teams. It covers call-for-proposals intake, speaker operations, human-authoritative review and communications, conflict-safe scheduling, publication, and public distribution. It is not a full CRM or marketing suite; the built-in Speaker CRM described below is in scope.

## Product truth, status, and evidence

[`spec/open-sessionboard.md`](spec/open-sessionboard.md) is the product truth source. It defines the supported contract and current status without implying that every acceptance item or release gate has passed.

Use this precedence when sources disagree:

1. Executable code/configuration and observed deployment behavior define what is currently running.
2. `spec/open-sessionboard.md` defines supported product scope and status.
3. [`ARCHITECTURE.md`](ARCHITECTURE.md) defines current system boundaries.
4. Operational documents define executable procedures.
5. [`docs/llm-judge-runs.md`](docs/llm-judge-runs.md) records evaluator evidence, coverage, and limitations.

The repository and local or mocked checks do not by themselves constitute release verification. Evidence artifacts and cited product research are retained under [`evidence/`](evidence/) and linked from the spec.

## Supported scope

- **Organizer control plane:** First-party event and session settings, rooms, tracks, statuses, agenda eligibility, and configurable CFP forms with custom fields, conditional logic, validation, and file requests.
- **Participant portal and built-in Speaker CRM:** Authorized multi-event portal access, drafts and submissions, speaker profiles, participant rosters, co-speakers, private files, comments, tasks, forms, and organizer visibility.
- **Evaluation and decisions:** Versioned evaluation plans and rubrics, reviewer projections, blind review, comments, reproducible scores, and human accept, waitlist, or reject decisions.
- **Communications:** Versioned OpenSend templates for verification, confirmations, reminders, decisions, tasks, and schedule lifecycle, plus event-scoped recipient-group email with snapshots and delivery history.
- **Reports and exports:** Program-only saved report definitions and audited CSV/XLSX output, including reproducible individual and cumulative grade exports for a selected evaluation-plan version.
- **Scheduling and distribution:** Conflict-safe, versioned agenda scheduling with public speaker and agenda embeds, API, webhooks, and RFC 5545 calendar delivery.
- **Advisory AI:** Human-applied evaluation suggestions, private agenda proposals, and content-remix candidates. AI never independently scores, decides, schedules, publishes, sends, exports, or overwrites source content.
- **Verified identity:** Reauthenticated, verified email/profile identity changes that preserve event grants by stable account identity.

Marketing automation, SMS, payment, multilingual workflows, sponsorship/exhibitor management, transcription/media AI, and unrelated AI insights remain outside the built-in Speaker CRM and program scope. Accelevents is a separate external event-platform integration, not a supported current feature.

## Runtime architecture

The canonical request path is:

```text
browser
  -> Next.js same-origin /api/* gateway
  -> separately deployed Hono Worker
  -> Airtable and Cloudflare operational services
```

- **Next.js web:** Renders the browser UI and forwards same-origin `/api/*` requests to the configured API upstream. It does not hold provider credentials or access Airtable, D1, R2, or Durable Objects directly.
- **Hono API Worker:** Enforces authentication and tenant authorization, validates requests, runs business workflows, serves the versioned API, and orchestrates integrations.
- **Airtable:** Authoritative store for program and business records.
- **D1:** Operational state, Better Auth records, API keys, idempotency, durable outbox jobs, delivery state, and audit records.
- **Durable Objects:** Tenant/event mutation serialization, schedule locks and conflict coordination, and calendar sequence allocation.
- **R2:** Private uploads and export artifacts, exposed only through authorized access.
- **Queue:** One multiplexed Cloudflare Queue (`OUTBOX_QUEUE`) carries typed outbox work for communications, calendar delivery, webhooks, and cache invalidation.
- **Ingress:** The API Worker handles HTTP `fetch`, Queue deliveries, and the production Cron Trigger for scheduled reminders. Workers AI is an advisory provider behind the API, never an authority.

## Authentication, communications, and calendar

Email/password, verified email, and magic-link authentication are supported through the API. Google, Microsoft, and other social OAuth providers are not supported. Calendar-provider OAuth is not required.

OpenSend uses:

- `auth@sessionboard.namuh.co` for verification and account messages
- `speakers@sessionboard.namuh.co` for speaker and event messages
- `calendar@sessionboard.namuh.co` for RFC 5545 calendar messages and organizer identity

## Hosting and domains

The current staging Workers endpoints are:

- Web: `https://open-sessionboard-web-staging.ashleyha0317.workers.dev`
- API: `https://open-sessionboard-api-staging.ashleyha0317.workers.dev`

The current production Workers endpoints are:

- Web: `https://open-sessionboard-web-production.ashleyha0317.workers.dev`
- API: `https://open-sessionboard-api-production.ashleyha0317.workers.dev`

These pinned `workers.dev` origins are the current hosts. `https://sessionboard.namuh.co` for web and `https://api.sessionboard.namuh.co` for API are recommended stable custom domains, but they remain pending and unconfigured; do not present them as current deployment URLs.

## Repository policy

Forge and GitHub are intentional dual mirrors:

- Forge: `https://forge.smol.ai/jaeyunha/open-sessionboard`
- GitHub: `https://github.com/jaeyunha/open-sessionboard`

Both mirrors remain private until the release gate passes. Forge is retained for competition-bonus eligibility. Neither mirror should be described as public before that gate, and Forge is not the sole repository mirror.

## Local development

Prerequisites are Bun, Node.js for the repository's ESM operational scripts, a Cloudflare account for deployed resources, an Airtable base, and an OpenSend key.

```bash
bun install
cp .env.example .env
bun run dev
```

The Next.js web application runs on port `3015`; the Hono Worker runs on port `8787`. Set `API_UPSTREAM_ORIGIN=http://127.0.0.1:8787`. The web health endpoint is `http://127.0.0.1:3015/health`; the API health endpoint is `http://127.0.0.1:8787/api/health`.

For isolated agent work, `./hack/create_worktree.sh <name> <base-ref>` now creates a sanitized local `.env` by default with only loopback URLs and `ai-engineer`; it never copies provider credentials. Use `--env-mode copy` only for the guarded integration/release worktree. Do not use `--env-mode symlink` for isolated agent work.

Local, staging, and production must use separate Airtable bases, D1 databases, Durable Objects, R2 buckets, Queues, secrets, API keys, and OpenSend credentials. Staging uses synthetic data and suppressed or sandboxed recipients. See [`docs/setup.md`](docs/setup.md).

## Quality commands

```bash
make check
make test
make test-e2e
make all
```

`make all` runs checks, unit/integration tests, and local Playwright; release candidates also run `make build`. Local and mocked tests are not deployed release evidence.

## API and operations

API clients use organization-scoped bearer keys with least-privilege scopes, stable cursor pagination, idempotency keys for retryable mutations, and optimistic concurrency for generic updates. Public embeds and feeds expose only explicitly published projections.

See the [API guide](docs/api.md), [OpenAPI contract](openapi/openapi.yaml), [calendar semantics](docs/calendar-semantics.md), [QA runbook](docs/qa-runbook.md), [deployment-readiness preflight](docs/deployment-readiness.md), and [release runbook](docs/release-runbook.md). The release runbook governs release evidence and any repository-visibility change; this README makes no release claim.

## License

AGPL-3.0-or-later.
