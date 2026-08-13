# Open Sessionboard

Open Sessionboard is source-available, program-side Sessionboard alternative for event-production teams. It covers call-for-proposals intake, speaker operations, human-authoritative review and communications, conflict-safe scheduling, publication, and public distribution. It is not a full CRM or marketing suite; the built-in Speaker CRM described below is in scope.

## Product truth, status, and evidence

[`spec/open-sessionboard.md`](spec/open-sessionboard.md) is the product truth source. It defines the supported contract and current status without implying that every acceptance item or release gate has passed.

Use this precedence when sources disagree:

1. Executable code/configuration and observed deployment behavior define what is currently running.
2. `spec/open-sessionboard.md` defines supported product scope and status.
3. [`ARCHITECTURE.md`](ARCHITECTURE.md) defines current system boundaries.
4. Operational documents define executable procedures.
5. [`docs/llm-judge-runs.md`](docs/llm-judge-runs.md) records evaluator evidence, coverage, and limitations.

The repository and local or mocked checks do not by themselves constitute release verification. Evidence artifacts and cited product research are retained under [`evidence/`](evidence/) and linked from the spec.

Integration with Airtable is a competition requirement documented in the
retained [`Kill My SaaS competition brief`](evidence/sources/kill-my-saas-brief.pdf).
For that reason, Airtable is the authoritative store for program and business
records, not an optional adapter. Self-hosters must provide a separate Airtable
base and restricted personal access token for each environment.

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
`API_URL` to their deployed HTTPS origins. Custom domains are recommended for
stable production URLs, but no domain is claimed as part of the public source
distribution.

## Repository policy

Forge and GitHub are intentional dual mirrors:

- Forge: `https://forge.smol.ai/jaeyunha/open-sessionboard`
- GitHub: `https://github.com/jaeyunha/open-sessionboard`

Both mirrors are currently private. Forge is retained for competition-bonus eligibility. Public visibility is a separate operator-controlled action and must not happen until the checklist in [`docs/public-release.md`](docs/public-release.md) passes.

## Local development

Normal `make dev` runs the production-shaped integrated runtime with a dedicated development Airtable base, Wrangler-local D1/Durable Objects/R2/Queue, real local Better Auth, and Mailpit-captured email. Staging and production keep isolated deployed resources.

```bash
bun install
cp .env.example .env
# Set AIRTABLE_ACCESS_TOKEN to a development-base-restricted token.
# Set AIRTABLE_BASE_DEV_ID to the dedicated development base.
bunx wrangler d1 migrations apply DB --cwd apps/api --local
make dev
```

The web app runs at `http://127.0.0.1:3015`, the API at `http://127.0.0.1:8787`, and the Mailpit inbox at `http://127.0.0.1:8025`. Integrated local mode never reads `AIRTABLE_BASE_ID` or deployed OpenSend credentials. Use `RUNTIME_PROFILE=fixture NEXT_PUBLIC_RUNTIME_PROFILE=fixture make dev` only for deterministic fixture work; Playwright selects both variables explicitly.

For isolated agent work, `./hack/create_worktree.sh <name> <base-ref>` creates a sanitized local `.env` by default and never copies provider credentials. Use `--env-mode copy` only for guarded integration/release work. Local, staging, and production resources and credentials must remain separate. See [`docs/setup.md`](docs/setup.md).

## Self-host on Cloudflare

Competition hosts and public users can run their own isolated deployment. You
need:

- a Cloudflare account with Workers, D1, Durable Objects, R2, and Queues;
- an Airtable personal access token and base;
- a public HTTPS origin for the web Worker and another for the API Worker; and
- Bun 1.3 or newer.

OpenSend and OpenAI are optional until you enable outbound delivery or advisory
AI. Better Auth secrets, provider tokens, and all operator resource IDs stay in
ignored environment files or Cloudflare Worker Secrets.

### 1. Install and configure

```bash
git clone https://github.com/jaeyunha/open-sessionboard.git
cd open-sessionboard
bun install

cp .env.example .env
cp .env.cloudflare.example .env.cloudflare-staging
cp .env.cloudflare.example .env.cloudflare-production
```

Set the Airtable and authentication values in `.env`. In each
`.env.cloudflare-<environment>` file, set:

```dotenv
CLOUDFLARE_ACCOUNT_ID=<your-account-id>
D1_DATABASE_ID=<your-d1-database-id>
WEB_ORIGIN=https://your-web.example.com
API_URL=https://your-api.example.com
NEXT_PUBLIC_APP_URL=https://your-web.example.com
API_UPSTREAM_ORIGIN=https://your-api.example.com
```

Use separate D1, R2, Queue, Airtable, and credential resources for staging and
production. The checked-in Wrangler files contain public placeholders only.
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

Supply `CLOUDFLARE_API_TOKEN` through the shell, root `.env`, or your CI secret
store. Before the first deployment, add the required Airtable, Better Auth, and
cache-invalidation values as Cloudflare Worker Secrets; follow
[`docs/setup.md`](docs/setup.md#cloudflare-worker-deployment). Then run:

```bash
node scripts/cloudflare/deploy.mjs staging open-sessionboard:staging
node scripts/cloudflare/deploy-web.mjs staging open-sessionboard-web:staging
```

Repeat with `production` only after the staging deployment passes the
[QA runbook](docs/qa-runbook.md). The API deploy applies D1 migrations before
publishing the Worker. Configure optional Worker Secrets, custom domains,
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

API clients use organization-scoped bearer keys with least-privilege scopes, stable cursor pagination, idempotency keys for retryable mutations, and optimistic concurrency for generic updates. Public embeds and feeds expose only explicitly published projections.

See the [API guide](docs/api.md), [OpenAPI contract](openapi/openapi.yaml), [calendar semantics](docs/calendar-semantics.md), [QA runbook](docs/qa-runbook.md), [deployment-readiness preflight](docs/deployment-readiness.md), and [release runbook](docs/release-runbook.md). The release runbook governs release evidence and any repository-visibility change; this README makes no release claim.

## License

Elastic License 2.0 (`Elastic-2.0`). This is source-available, not OSI open-source software.
