# Eventloom

> **Status:** Eventloom is source-present and under active development. All product
> areas remain **partial** and no area is **release-verified**. Local tests,
> fixtures, configured providers, and repository visibility are not release
> evidence. See the [product contract](spec/eventloom.md) and
> [release runbook](docs/release-runbook.md).

Eventloom is a source-available, program-side Sessionboard alternative for event
production teams. It covers CFP intake, speaker operations, human-authoritative
review and communications, conflict-safe scheduling, publication, and public
distribution. The built-in Speaker CRM is supported scope; Eventloom is not a
general marketing CRM or a full event-commerce platform.

## Product scope

The supported contract includes:

- organizer administration for events, sessions, rooms, tracks, statuses, CFP
  forms, tasks, files, reports, integrations, and publication history;
- participant portals and an organization-scoped Speaker CRM with contacts,
  imports, tags, custom fields, segments, notes, duplicate handling, and outreach;
- versioned review plans, blind review, assignments, reproducible scoring, and
  human accept, waitlist, or reject decisions;
- versioned OpenSend communications with recipient snapshots, delivery history,
  reminders, and RFC 5545 calendar lifecycle messages;
- private, conflict-safe agenda drafts and immutable published projections for
  speaker galleries, agendas, embeds, JSON, iCal, and webhooks;
- audited CSV/XLSX reports and human-applied advisory AI for evaluation, agenda,
  and content-remix suggestions; and
- email/password and magic-link authentication with verified email.

The currently mounted public-v1 API is intentionally narrower than that product
contract: it exposes discovery and webhook administration through scoped bearer
keys. Generic program-resource routes remain withheld until their public
projections and concurrency contracts are publication-safe.

Accelevents, social OAuth, payment, SMS, external CRM synchronization, marketing
automation, sponsorship/exhibitor management, multilingual workflows, and
transcription/media AI are unsupported. See [`spec/eventloom.md`](spec/eventloom.md)
for the complete status vocabulary, invariants, and non-goals.

## Runtime architecture

```text
browser
  -> Next.js same-origin /api/* gateway
  -> separately deployed Hono Worker
  -> D1 business and operational authority
     + Durable Object coordination
     + R2 private files and export artifacts
     + D1 outbox and one multiplexed Cloudflare Queue
     + optional provider adapters
```

- **Next.js web** renders the UI and forwards same-origin API requests. It never
  receives provider credentials or direct D1, R2, Durable Object, or Airtable
  access.
- **Hono Worker** authenticates requests, enforces tenant/event authorization,
  validates domain commands, and accepts HTTP, Queue, and Cron Trigger events.
- **D1** is authoritative for product and operational state. Durable Objects
  serialize selected tenant/event mutations; D1 concurrency checks remain final.
- **R2 and Queue** hold authorized private artifacts and typed asynchronous work
  for communications, calendar, webhooks, and cache invalidation.
- **Airtable** is optional and never authoritative. Its outbound and controlled
  inbound components are implemented and tested in isolation, but they are not
  yet composed into the exported Queue/scheduled/webhook runtime. Ordinary
  product reads and writes do not depend on Airtable.
- **Advisory AI** uses OpenAI Responses only when `AI_PROVIDER=openai`. Provider
  output is private and inert until an authorized human applies, edits, or rejects
  it. Set `AI_PROVIDER=disabled` to run without OpenAI.

OpenSend is required by the current integrated API runtime. Sender addresses and
calendar UID domains are deployment-owned verified identities. The
`sessionboard.namuh.co` identities described in the architecture are hosted
defaults, not source-compiled self-hosting requirements.

## Local development

### Prerequisites

- Bun **1.3.14** (the version pinned in `package.json`)
- Docker with Compose for Mailpit and `make dev`
- Node.js on `PATH` for the deployment and release scripts that invoke `node`

### Start the integrated local runtime

```bash
git clone https://github.com/jaeyunha/eventloom.git
cd eventloom
bun install
cp .env.example .env
```

Set a random `BETTER_AUTH_SECRET`. If no backend-only OpenAI key is available,
set `AI_PROVIDER=disabled`; the committed template intentionally selects OpenAI
for explicit local AI work and rejects an empty key.

```bash
bunx wrangler d1 migrations apply DB --cwd apps/api --local
make dev
```

Local endpoints:

- web: `http://127.0.0.1:3015`
- API: `http://127.0.0.1:8787`
- Mailpit: `http://127.0.0.1:8025`

The integrated runtime has no committed universal login. Create accounts through
the real signup and grant flows. For deterministic fixture work only:

```bash
RUNTIME_PROFILE=fixture NEXT_PUBLIC_RUNTIME_PROFILE=fixture make dev
```

Fixture personas do not represent normal local or deployed credentials. Detailed
environment isolation, account, provider, and worktree guidance lives in
[`docs/setup.md`](docs/setup.md).

## Quality commands

| Command | Purpose |
| --- | --- |
| `make check` | Typecheck, lint, and formatting checks |
| `make test` | Unit, script, API integration, and runtime integration tests |
| `make test-e2e` | Isolated local Playwright suite |
| `make build` | Build every workspace package |
| `make all` | `check`, `test`, and local Playwright; does not build deployables |
| `bun run test:eval` | Separate evaluator tooling diagnostics, not part of `make all` |

Local and mocked checks are not deployed release evidence. Release candidates
must also pass the clean build, staging, provider, accessibility, performance,
security, and manual gates in the QA and release runbooks.

## Eventloom CLI and agent skill

The repository includes a read-only, multi-profile CLI. It discovers access from
the authenticated API, resolves roles and grants on the server for every request,
and fails closed when local context is stale or ambiguous.

```bash
bun run --filter @eventloom/cli build
export PATH="$PWD/packages/cli/dist:$PATH"
eventloom auth login --profile work --api-url https://api.example.com
eventloom access list --profile work
eventloom context use --profile work --organization org_123 --event event_456
eventloom organizer status --profile work
```

Profiles live below `~/.eventloom` in permission-hardened plaintext files. Protect
that directory and its backups because authenticated session material is
sensitive. The CLI does not expose a generic raw mutation surface.

The built executable bundles [`skills/eventloom`](skills/eventloom):

```bash
eventloom skill install --agent all --global
# or, for an ignored project-local installation
eventloom skill install --agent all --project
```

The installer records a manifest, refuses to overwrite modified installations,
and stages replacements with rollback. Consequential product actions remain
human-controlled.

## Self-hosting on Cloudflare

A deployment needs Cloudflare Workers, D1, Durable Objects, R2, Queues, two HTTPS
origins (web and API), and an OpenSend endpoint with verified deployment-owned
senders. OpenAI and Airtable are optional.

```bash
cp .env.cloudflare.example .env.cloudflare-staging
cp .env.cloudflare.example .env.cloudflare-production
node scripts/cloudflare/dry-run.mjs staging
node scripts/cloudflare/deploy-web.mjs staging --dry-run
make check
make test
```

Keep staging and production D1, R2, Queue, sender, provider, and credential
resources separate. Resource IDs belong in ignored `.env.cloudflare-*` files;
provider keys, `BETTER_AUTH_SECRET`, and cache-invalidation material belong in
Cloudflare Worker Secrets. Generated Wrangler configuration is ignored.

After the staging configuration and preflight pass:

```bash
node scripts/cloudflare/deploy.mjs staging open-sessionboard:staging
node scripts/cloudflare/deploy-web.mjs staging open-sessionboard-web:staging
```

Do not repeat this for production until staging passes
[`docs/qa-runbook.md`](docs/qa-runbook.md). Source availability and deployable
configuration do not imply production readiness.

## Documentation

- [Product contract and current status](spec/eventloom.md)
- [Architecture and state ownership](ARCHITECTURE.md)
- [Visual and interaction contract](DESIGN.md)
- [Setup and deployment configuration](docs/setup.md)
- [API guide](docs/api.md) and [OpenAPI contract](openapi/openapi.yaml)
- [Calendar semantics](docs/calendar-semantics.md)
- [Deployment readiness](docs/deployment-readiness.md)
- [QA runbook](docs/qa-runbook.md)
- [Release runbook](docs/release-runbook.md)
- [Public repository checklist](docs/public-release.md)
- [Evidence policy](evidence/README.md)

GitHub and Forge are intentional mirrors. Visibility is an operator-controlled
release action and does not prove feature or deployment verification. The
[public repository checklist](docs/public-release.md) governs history scanning,
artifact rights, contributor approval, and the final visibility transition.

## License

Elastic License 2.0 (`Elastic-2.0`). Eventloom is source-available software, not
OSI-approved open-source software.
