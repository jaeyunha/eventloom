# Eventloom

[![License: Elastic 2.0](https://img.shields.io/badge/license-Elastic%202.0-5b5bd6.svg)](LICENSE)
[![Bun 1.3.14](https://img.shields.io/badge/Bun-1.3.14-black?logo=bun)](package.json)
[![Cloudflare Workers](https://img.shields.io/badge/runtime-Cloudflare%20Workers-F38020?logo=cloudflare)](ARCHITECTURE.md)
[![Status: active development](https://img.shields.io/badge/status-active%20development-f59e0b.svg)](spec/eventloom.md)

**Run an event program from call for papers to published agenda—without
spreadsheets becoming the system of record or AI taking control.**

Eventloom is a source-available workspace for conference and event-production
teams. It brings CFP intake, speaker operations, structured review,
communications, scheduling, publication, and a built-in Speaker CRM into one
tenant-safe system.

> [!IMPORTANT]
> Eventloom is in active development. Broad end-to-end workflows are
> implemented and tested across CFP intake, review, speaker operations,
> scheduling, publication, reporting, and Speaker CRM. Complete production
> release verification is still in progress; see the
> [product contract](spec/eventloom.md) for current evidence and known gaps.

## Origin

Eventloom began as a submission to swyx's
[Kill My SaaS](https://luma.com/ls-06v7) eval competition — a weekend
challenge to clone sessionboard.com, with the winning entry receiving
$10,000 and a Latent.Space writeup. In his
[call for entries](https://x.com/swyx/status/2085517544795079014), swyx
framed the premise as *"everyone wins except high margin low moat saas."*
This repository is the open-sourced result of that attempt, now developed
independently as Eventloom.

[Quick start](#quick-start) · [Architecture](#architecture) ·
[Self-hosting](#self-hosting) · [Documentation](#documentation) ·
[License](#license)

## Why Eventloom

Event program work is unusually connected: a CFP answer becomes review context,
a decision becomes a message, an accepted proposal becomes a session, and a
schedule change becomes a calendar update and public revision. Splitting those
steps across forms, spreadsheets, inboxes, and page builders creates drift.

Eventloom is built around five principles:

- **One authoritative program record.** D1 owns business and operational state;
  external systems are adapters, never fallback databases.
- **Humans remain authoritative.** Review outcomes, messages, schedules, and
  publication require explicit human action. AI produces private suggestions,
  not decisions.
- **Publication is immutable and explainable.** Draft changes cannot silently
  alter public projections; publication and rollback create auditable revisions.
- **Tenant safety is structural.** Authentication, organization/event grants,
  optimistic concurrency, idempotency, and private-file authorization are server
  responsibilities.
- **Integrations fail independently.** Queued, typed, retryable side effects keep
  Airtable, mail, calendar, webhook, or AI failures from blocking ordinary
  product reads and writes.

## Supported product scope

The supported product contract covers the following areas. The table describes
scope, not release verification.

| Area | Supported scope |
| --- | --- |
| CFP | Versioned forms, reusable/custom fields, conditional rules, autosave, participant intake, files, close dates, and submission limits |
| Speaker operations | Account-bound portal contexts, profiles, tasks, deliverables, private files, comments, reminders, and authorized exports |
| Speaker CRM | Organization-scoped contacts, CSV import, tags, custom fields, segments, pipeline stages, notes, history, deduplication, merges, and outreach |
| Review and decisions | Versioned plans, rounds, rubrics, assignments, blind review, conflict abstention, reproducible grades, and human accept/waitlist/reject decisions |
| Communications and calendar | Versioned templates, recipient snapshots, delivery history, reminders, and idempotent RFC 5545 request/update/cancel messages |
| Agenda and publication | Private versioned drafts, hard conflict checks, warning overrides, atomic publication, rollback, public agendas, galleries, embeds, JSON, and iCal |
| Reports and advisory AI | Audited CSV/XLSX reports plus private, provenance-labeled agenda, evaluation, and remix suggestions that require human apply/edit/reject |
| API and webhooks | Scoped bearer keys, stable errors, pagination, idempotency, optimistic concurrency, signed webhooks, and publication-safe projections |
| CLI and agent skill | Read-only multi-profile access discovery and role-aware workflows with fail-closed local context |

Eventloom is not trying to be a ticketing, payment, sponsorship, exhibitor,
marketing-automation, SMS, transcription, or general event-commerce platform.
Accelevents and social OAuth are not supported current integrations.

## Architecture

```text
Browser
  └── Next.js web application
        └── same-origin /api/* gateway ───────────────┐
Scoped API clients and provider callbacks ────────────┤
Cloudflare Queue and Cron events ─────────────────────┤
                                                      ▼
                                               Hono API Worker
                                                 ├── D1
                                                 │     authoritative business + operational state
                                                 ├── Durable Objects
                                                 │     ordered tenant/event coordination
                                                 ├── R2
                                                 │     private files and export artifacts
                                                 ├── Cloudflare Queue
                                                 │     communications, calendar, webhooks, cache work
                                                 ├── OpenSend
                                                 │     email and calendar delivery
                                                 ├── OpenAI Responses
                                                 │     optional, advisory-only AI
                                                 └── Airtable
                                                       optional organization adapter
```

The browser never receives provider credentials or direct D1, R2, Durable
Object, Queue, or Airtable access. The Worker derives tenant and event authority
from the authenticated principal and server-side grants.

Airtable projection and controlled-inbound components exist and are tested in
isolation, but are not yet composed into the exported Queue, scheduled, and
webhook runtime. Ordinary Eventloom reads and writes do not depend on Airtable.

Read [`ARCHITECTURE.md`](ARCHITECTURE.md) for state ownership, concurrency,
integration, authentication, and deployment boundaries.

## Quick start

### Requirements

- [Bun](https://bun.sh/) **1.3.14**
- Docker with Compose for local Mailpit
- Node.js on `PATH` for deployment/release scripts

### Run the integrated local stack

```bash
git clone https://github.com/jaeyunha/eventloom.git
cd eventloom
bun install
cp .env.example .env
```

Set a random `BETTER_AUTH_SECRET` in `.env`. To run without an OpenAI key, set:

```dotenv
AI_PROVIDER=disabled
```

Prepare local D1 and start the web app, API Worker, Mailpit, and local mail
bridge:

```bash
bunx wrangler d1 migrations apply DB --cwd apps/api --local
make dev
```

| Service | URL |
| --- | --- |
| Web application | <http://127.0.0.1:3015> |
| API Worker | <http://127.0.0.1:8787> |
| Mailpit | <http://127.0.0.1:8025> |

Create accounts through the real signup and grant flows. Deterministic fixture
personas are available for focused development only:

```bash
RUNTIME_PROFILE=fixture NEXT_PUBLIC_RUNTIME_PROFILE=fixture make dev
```

Fixture accounts are not deployment credentials. See
[`docs/setup.md`](docs/setup.md) for environment isolation, account setup,
provider configuration, and worktree guidance.

## Repository layout

```text
apps/web/               Next.js browser application and same-origin API gateway
apps/api/               Hono Worker, domain services, D1, R2, Queue, and Cron
packages/contracts/     Shared Zod contracts and domain types
packages/cli/           Eventloom CLI and bundled agent skill
openapi/                Checked-in public API contract
spec/eventloom.md       Authoritative supported scope and status
docs/                   Setup, API, QA, deployment, and release operations
skills/eventloom/       Read-only Eventloom agent skill source
```

## Development and verification

```bash
make check      # typecheck, lint, and formatting checks
make test       # unit, script, API integration, and runtime integration tests
make test-e2e   # isolated local Playwright suite
make build      # build every workspace package
make all        # check + test + Playwright; does not build deployables
```

`bun run test:eval` runs separate evaluator-tooling diagnostics and is not part
of `make all`.

Local and mocked checks do not replace staging, provider, accessibility,
performance, security, and manual evidence for a production release.

### Worktrees

The repository includes a helper for isolated changes:

```bash
./hack/create_worktree.sh my-change github/main
```

It creates a worktree below `~/wt/open-sessionboard`, provisions safe local
environment files, and installs the pinned dependencies. Use
`./hack/cleanup_worktree.sh my-change` when the branch is finished.

## CLI and agent skill

Build and place the CLI on your current shell path:

```bash
bun run --filter @eventloom/cli build
export PATH="$PWD/packages/cli/dist:$PATH"
```

Authenticate a profile and discover server-authorized access:

```bash
eventloom auth login --profile work --api-url https://api.example.com
eventloom access list --profile work
eventloom context use --profile work --organization org_123 --event event_456
eventloom organizer status --profile work
```

Profiles live below `~/.eventloom` in permission-hardened plaintext files.
Protect that directory and its backups because authenticated session material is
sensitive. The CLI deliberately has no generic raw mutation surface.

Install the bundled skill globally or into an ignored project-local agent
configuration:

```bash
eventloom skill install --agent all --global
eventloom skill install --agent all --project
```

The installer records a manifest, refuses to overwrite modified installations,
and stages replacements with rollback.

## Self-hosting

A deployment uses Cloudflare Workers, D1, Durable Objects, R2, Queues, separate
HTTPS web/API origins, and an OpenSend endpoint with verified deployment-owned
sender identities. OpenAI and Airtable are optional.

Start with isolated staging and production configuration:

```bash
cp .env.cloudflare.example .env.cloudflare-staging
cp .env.cloudflare.example .env.cloudflare-production
node scripts/cloudflare/dry-run.mjs staging
node scripts/cloudflare/deploy-web.mjs staging --dry-run
```

Keep D1 databases, R2 buckets, Queues, sender identities, provider resources,
and credentials separate by environment. Resource identifiers belong in ignored
`.env.cloudflare-*` files; credentials belong in Cloudflare Worker Secrets.

After staging preflight passes:

```bash
node scripts/cloudflare/deploy.mjs staging open-sessionboard:staging
node scripts/cloudflare/deploy-web.mjs staging open-sessionboard-web:staging
```

Do not treat deployable configuration as production readiness. Follow
[`docs/deployment-readiness.md`](docs/deployment-readiness.md),
[`docs/qa-runbook.md`](docs/qa-runbook.md), and
[`docs/release-runbook.md`](docs/release-runbook.md) before a production release.

## Contributing

Focused fixes and well-scoped improvements are welcome. Read
[`CONTRIBUTING.md`](CONTRIBUTING.md) for project boundaries, local setup,
verification expectations, pull request guidance, and contribution licensing.

## Project status

Eventloom is pre-release software under active development. The checked-in source
implements broad end-to-end workflows, but release status is governed by
[`spec/eventloom.md`](spec/eventloom.md) and the QA/release runbooks. Public
source availability does not mean a hosted deployment has passed those gates.

The currently mounted public-v1 API is narrower than the full product contract:
it exposes discovery and webhook administration through scoped bearer keys.
Generic program-resource routes remain withheld until their public projections
and concurrency contracts are publication-safe.

## Hosted version and contact

Running your own organization on Eventloom takes Cloudflare account setup,
provider configuration, and operational care. If you would rather use a
hosted deployment, or you want to discuss deploying Eventloom for your
event program, reach out:

- **Email:** [jaeyunha@namuh.co](mailto:jaeyunha@namuh.co)

## Documentation

- [Product contract and current status](spec/eventloom.md)
- [Architecture and state ownership](ARCHITECTURE.md)
- [Visual and interaction contract](DESIGN.md)
- [Setup and environment isolation](docs/setup.md)
- [API guide](docs/api.md) and [OpenAPI contract](openapi/openapi.yaml)
- [Calendar and timezone semantics](docs/calendar-semantics.md)
- [Deployment readiness](docs/deployment-readiness.md)
- [QA runbook](docs/qa-runbook.md)
- [Release runbook](docs/release-runbook.md)
- [Repository publication checklist](docs/public-release.md)
- [Evidence policy](evidence/README.md)

## License

Eventloom is licensed under the [Elastic License 2.0](LICENSE)
(`Elastic-2.0`). It is **source-available**, not OSI-approved open-source
software. Changing that classification requires an explicit licensing decision.
