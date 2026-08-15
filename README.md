# Eventloom

Eventloom is a source-available, program-side Sessionboard alternative for event-production teams. It covers call-for-proposals intake, speaker operations, human-authoritative review and communications, conflict-safe scheduling, publication, and public distribution. It is not a full CRM or marketing suite; the built-in Speaker CRM described below is in scope.

## Product truth, status, and evidence

[`spec/eventloom.md`](spec/eventloom.md) is the product truth source. It defines the supported contract and current status without implying that every acceptance item or release gate has passed.

Use this precedence when sources disagree:

1. Executable code/configuration and observed deployment behavior define what is currently running.
2. `spec/eventloom.md` defines supported product scope and status.
3. [`ARCHITECTURE.md`](ARCHITECTURE.md) defines current system boundaries.
4. Operational documents define executable procedures.
5. [`docs/llm-judge-runs.md`](docs/llm-judge-runs.md) records evaluator evidence, coverage, and limitations.

The repository and local or mocked checks do not by themselves constitute
release verification. [`evidence/README.md`](evidence/README.md) distinguishes
retained source snapshots, provider observations, and local QA artifacts from
release evidence.

The competition brief awards bonus credit for Airtable use; it does not define
an Airtable schema or require Airtable to be authoritative. D1 is the business
database. Organizations may optionally connect an isolated Airtable base
through OAuth or an explicitly enabled restricted personal access token for
asynchronous projections and controlled selected-field inbound updates.

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
  -> D1 business and operational authority
     + Durable Object coordination
     + R2 private files and artifacts
     + D1 outbox and Cloudflare Queue delivery
     + optional Airtable and OpenAI adapters
```

- **Next.js web:** Renders the browser UI and forwards same-origin `/api/*` requests to the configured API upstream. It does not hold provider credentials or access Airtable, D1, R2, or Durable Objects directly.
- **Hono API Worker:** Enforces authentication and tenant authorization, validates requests, runs business workflows, serves the versioned API, and orchestrates integrations.
- **D1:** Authoritative store for program records and operational state, including Better Auth records, API keys, idempotency, outbox jobs, delivery state, and audit records.
- **Airtable:** Optional organization-scoped adapter for asynchronous projections and controlled selected-field inbound updates; ordinary reads and writes do not depend on it.
- **Durable Objects:** Tenant/event mutation admission and schedule coordination; D1 remains authoritative for committed business state.
- **R2:** Private uploads and export artifacts, exposed only through authorized access.
- **Queue:** One multiplexed Cloudflare Queue (`OUTBOX_QUEUE`) carries typed outbox work for communications, calendar delivery, webhooks, and cache invalidation.
- **Ingress and advisory AI:** The API Worker handles HTTP `fetch`, Queue deliveries, and the production Cron Trigger for scheduled reminders. Advisory AI uses OpenAI Responses with a backend-only key and is never an authority or application boot prerequisite.

## Authentication, communications, and calendar

Email/password, verified email, and magic-link authentication are supported through the API. Google, Microsoft, and other social OAuth providers are not supported. Calendar-provider OAuth is not required.

OpenSend uses:

- `auth@sessionboard.namuh.co` for verification and account messages
- `speakers@sessionboard.namuh.co` for speaker and event messages
- `calendar@sessionboard.namuh.co` for RFC 5545 calendar messages and organizer identity

## Hosting and domains

The repository does not publish an operator's Cloudflare account ID, D1 IDs, or
`workers.dev` subdomain. Each deployment supplies its account and resource
identity through ignored environment files. The committed Wrangler
configuration contains non-deployable placeholders and stable public binding
names only.

Operators set `NEXT_PUBLIC_APP_URL`, `API_UPSTREAM_ORIGIN`, `WEB_ORIGIN`, and
`API_URL` to their deployed HTTPS origins. Production custom-domain routing also
requires these four explicit keys because the production API and web Workers
use `workers_dev = false`:

```dotenv
API_HOSTNAME=api.production.example.com
API_ZONE_NAME=production.example.com
WEB_HOSTNAME=web.production.example.com
WEB_ZONE_NAME=production.example.com
```

Each hostname must belong to its corresponding operator-owned Cloudflare zone.
The values above are production examples, not repository-owned domains. Set
`AI_PROVIDER=disabled` or `AI_PROVIDER=openai`. OpenAI is optional when the
provider is disabled, but `OPENAI_API_KEY` is required when
`AI_PROVIDER=openai`. The API deployment preflight validates the API renderer
configuration, while the web deployment dry run validates the separate web
renderer configuration.

## Repository policy

Forge and GitHub are intentional dual mirrors:

- Forge: `https://forge.smol.ai/jaeyunha/open-sessionboard`
- GitHub: `https://github.com/jaeyunha/open-sessionboard`

Both mirrors are currently private. Forge is retained for competition-bonus eligibility. Public visibility is a separate operator-controlled action and must not happen until the checklist in [`docs/public-release.md`](docs/public-release.md) passes.

## Local development

Normal `make dev` runs the production-shaped D1 runtime with Wrangler-local D1/Durable Objects/R2/Queue, real local Better Auth, and Mailpit-captured email. Airtable is optional and can be connected to a dedicated development base when integration work requires it.

After copying `.env.example`, set a random `BETTER_AUTH_SECRET` and set
`AI_PROVIDER=disabled` unless you are also supplying a backend-only
`OPENAI_API_KEY`. The committed template selects OpenAI for explicit local AI
work and will reject an empty key.

```bash
bun install
cp .env.example .env
bunx wrangler d1 migrations apply DB --cwd apps/api --local
make dev
```

The web app runs at `http://127.0.0.1:3015`, the API at `http://127.0.0.1:8787`, and the Mailpit inbox at `http://127.0.0.1:8025`. Use `RUNTIME_PROFILE=fixture NEXT_PUBLIC_RUNTIME_PROFILE=fixture make dev` only for deterministic fixture work; Playwright selects both variables explicitly.

The integrated runtime has no universal committed login. Create accounts
through the real signup and access-grant workflows, and keep operator-specific
passwords outside the repository. The deterministic persona credentials in
[`docs/setup.md`](docs/setup.md#fixture-only-deterministic-accounts) work only
with the fixture runtime and must not be used as normal local-development
credentials.

For isolated agent work, `./hack/create_worktree.sh <name> <base-ref>` creates a sanitized local `.env` by default and never copies provider credentials. Use `--env-mode copy` only for guarded integration/release work. Local, staging, and production resources and credentials must remain separate. See [`docs/setup.md`](docs/setup.md).

## Eventloom CLI and agent skill

The repository includes a read-only, multi-profile CLI for agents and operators.
It discovers access from the authenticated Eventloom API, fails closed when a
saved context is stale or ambiguous, and never grants authority from local
configuration alone.

### Build and run the CLI

The CLI is currently distributed from source rather than as a published package:

```bash
bun install
bun run --filter @eventloom/cli build
export PATH="$PWD/packages/cli/dist:$PATH"
eventloom --help
```

Each named profile stores one authenticated account and its immutable API
origin. Sign-in credentials are read interactively or from standard input; do
not put passwords in command arguments:

```bash
eventloom auth login --profile work --api-url https://api.example.com
eventloom auth list
eventloom access list --profile work
```

Profiles and active context are stored below `~/.eventloom`. This is a
permission-hardened plaintext store, not an operating-system keychain:
directories use mode `0700`, files use mode `0600`, and symlinks or non-regular
files are rejected. Protect the directory and any backups because authenticated
session material is sensitive.

Select a freshly authorized context before a narrow role read:

```bash
eventloom context use \
  --profile work \
  --organization org_123 \
  --event event_456

eventloom context show
eventloom organizer status --profile work
eventloom reviewer inbox --profile work
eventloom speaker tasks --profile work
```

Use `--all-contexts` only when a role command should read every compatible
context for one profile. Use `--all-accounts` for deliberate multi-profile
access discovery or briefing:

```bash
eventloom access list --all-accounts
eventloom briefing --all-accounts
```

Add `--json` to receive the stable machine-readable envelope. Exit codes are
`0` for success, `2` for invalid usage or input, `3` for authentication
failure, `4` for authorization or incompatible context, `5` when an aggregate
operation has no successful profile, and `1` for unexpected local, transport,
or server failures.

The current organizer, reviewer, speaker, and briefing commands are read-only.
Eventloom resolves roles, capabilities, organization membership, and event
access freshly on the server for every request. The CLI does not expose a
generic raw API command or mutation surface.

### Install the Eventloom agent skill

The built executable bundles the canonical skill from
[`skills/eventloom`](skills/eventloom). Install it globally for Codex, Claude
Code, or both:

```bash
eventloom skill install --agent codex --global
eventloom skill install --agent claude-code --global
eventloom skill install --agent all --global
```

Global installs are written to `~/.agents/skills/eventloom` for Codex and
`~/.claude/skills/eventloom` for Claude Code. To keep the skill inside the
current repository instead, use project scope:

```bash
eventloom skill install --agent all --project
```

Project installs use `.agents/skills/eventloom` and
`.claude/skills/eventloom`. The installer records a deterministic manifest,
refuses to overwrite a modified installation, and performs staged replacement
with rollback. Use `--force` only when intentionally replacing a locally
modified skill directory.

The skill instructs agents to use only the installed CLI's read-only,
server-authorized command surface. Broad reads must be explicit, consequential
actions remain human-controlled, and credentials or raw session material must
never be printed, logged, or passed through agent prompts.

## Self-host on Cloudflare

Competition hosts and public users can run their own isolated deployment. You
need:

- a Cloudflare account with Workers, D1, Durable Objects, R2, and Queues;
- a public HTTPS origin for the web Worker and another for the API Worker; and
- Bun 1.3 or newer.

OpenSend is required by the current API runtime because authentication,
communications, and calendar delivery are composed at Worker boot. Set `AI_PROVIDER=disabled` to run without OpenAI, or `AI_PROVIDER=openai` to
enable advisory AI. OpenAI is optional only when the provider is disabled;
`OPENAI_API_KEY` is required when `AI_PROVIDER=openai`. Better Auth secrets,
provider tokens, and all operator resource IDs stay in ignored environment
files or Cloudflare Worker Secrets.

### 1. Install and configure

```bash
git clone https://github.com/jaeyunha/open-sessionboard.git
cd open-sessionboard
bun install

cp .env.example .env
cp .env.cloudflare.example .env.cloudflare-staging
cp .env.cloudflare.example .env.cloudflare-production
```

Set the authentication values in `.env`. Airtable is optional, and D1 remains
authoritative. The integrated runtime does not use `AIRTABLE_BASE_ID` or
`AIRTABLE_BASE_DEV_ID` as startup requirements; organizations connect their
authorized base through the integration flow. In each
`.env.cloudflare-<environment>` file, set:

```dotenv
CLOUDFLARE_ACCOUNT_ID=<your-account-id>
D1_DATABASE_ID=<your-d1-database-id>
WEB_ORIGIN=https://your-web.example.com
API_URL=https://your-api.example.com
NEXT_PUBLIC_APP_URL=https://your-web.example.com
API_UPSTREAM_ORIGIN=https://your-api.example.com
OPENSEND_API_URL=https://your-opensend.example.com
AUTH_FROM_EMAIL=auth@your-domain.example
SPEAKERS_FROM_EMAIL=speakers@your-domain.example
CALENDAR_FROM_EMAIL=calendar@your-domain.example
CALENDAR_UID_DOMAIN=calendar.your-domain.example
AI_PROVIDER=disabled
# Set AI_PROVIDER=openai and add OPENAI_API_KEY when advisory AI is enabled.
OPENAI_MODEL=<model-name>
OPENAI_AGENDA_MODEL=<agenda-model-name>
OPENAI_EVALUATION_MODEL=<evaluation-model-name>
OPENAI_REMIX_MODEL=<remix-model-name>
# Web custom-domain renderer values, when applicable:
# route pattern=<your-web-host>, zone_name=<your-cloudflare-zone>
```

Use separate D1, R2, Queue, and credential resources for staging and
production. OpenSend is required by the current runtime, so configure its
endpoint, key, senders, and calendar UID domain for every environment. If
Airtable is enabled, its bases and credentials must also remain isolated. The checked-in Wrangler files contain public placeholders only.
Deployment generates the ignored `apps/api/wrangler.generated.toml`; do not
commit that file or either `.env.cloudflare-*` file.

### 2. Validate before deploying

```bash
node scripts/cloudflare/dry-run.mjs staging
node scripts/cloudflare/deploy-web.mjs staging --dry-run
make check
make test
```

### 3. Deploy

Supply `CLOUDFLARE_API_TOKEN` through the shell or your CI secret store.
Staging and production deployment scripts do not inherit it from the local root
`.env`. Before the first deployment, add the required Better Auth and
cache-invalidation values as Cloudflare Worker Secrets. Add Airtable credentials
only when enabling the optional adapter; follow
[`docs/setup.md`](docs/setup.md#cloudflare-resources-and-api-deployment). Then run:

```bash
node scripts/cloudflare/deploy.mjs staging open-sessionboard:staging
node scripts/cloudflare/deploy-web.mjs staging open-sessionboard-web:staging
```

Repeat with `production` only after the staging deployment passes the
[QA runbook](docs/qa-runbook.md). The API deploy applies D1 migrations before
publishing the Worker. Configure optional Airtable, Worker Secrets, custom domains,
OpenSend, OpenAI, and provider callbacks as described in
[`docs/setup.md`](docs/setup.md) and
[`docs/release-runbook.md`](docs/release-runbook.md).

## Quality commands

```bash
make check
make test
make test-e2e
make all
```

`make all` runs checks, unit/integration tests, and local Playwright; release candidates also run `make build`. Local and mocked tests are not deployed release evidence.

## API and operations

The mounted tenant-scoped public-v1 API currently provides discovery and
webhook administration through organization-scoped bearer keys. Generic
program-resource routes remain withheld until publication-safe projections and
their concurrency contracts are ready. Public embeds and feeds are separate
anonymous surfaces that expose only explicitly published projections.

See the [API guide](docs/api.md), [OpenAPI contract](openapi/openapi.yaml), [calendar semantics](docs/calendar-semantics.md), [QA runbook](docs/qa-runbook.md), [deployment-readiness preflight](docs/deployment-readiness.md), and [release runbook](docs/release-runbook.md). The release runbook governs release evidence and any repository-visibility change; this README makes no release claim.

## License

Elastic License 2.0 (`Elastic-2.0`). This is source-available, not OSI open-source software.
