# Environment and deployment setup

Eventloom has two separately deployed services: a Next.js web Worker and a Hono API Worker. This guide describes the repository's current configuration and the operator procedures; it does not claim that an environment has been provisioned, deployed, or release-verified. Keep resource IDs and all secret values in the operator's secret manager or in ignored environment files.

## Scope and deployment origins

The built-in Speaker CRM is supported first-party product scope. Accelevents is a separate external event-platform integration, not the built-in CRM, and is unsupported by the current runtime; it has no credentials, setup, preflight, QA, monitoring, or release step here. Interactive authentication is Better Auth email/password plus verified email and one-time email links.

The deployment contract is supplied per operator environment:

| Environment | Web origin | API origin | Current hosting state |
| --- | --- | --- | --- |
| Local | `http://127.0.0.1:3015` | `http://127.0.0.1:8787` | Local processes; browser uses same-origin `/api/*` through the web proxy |
| Staging | `NEXT_PUBLIC_APP_URL` / `WEB_ORIGIN` | `API_UPSTREAM_ORIGIN` / `API_URL` | Operator-supplied Cloudflare Workers origins |
| Production | `NEXT_PUBLIC_APP_URL` / `WEB_ORIGIN` | `API_UPSTREAM_ORIGIN` / `API_URL` | Operator-supplied web and API Worker origins. `https://eventloom.namuh.co` is only the current hosted example. |

Custom domains are recommended for a stable public contract. DNS, Worker
bindings, cookies, CORS, callbacks, and health checks must be verified by each
operator before those domains are used as deployment inputs.

The current hosted example uses `eventloom.namuh.co` as its custom domain.
Self-hosted production deployments must supply and validate their own web and
API origins and these four route keys. They are required because production
uses `workers_dev = false` for both Workers:

```dotenv
API_HOSTNAME=api.production.example.com
API_ZONE_NAME=production.example.com
WEB_HOSTNAME=web.production.example.com
WEB_ZONE_NAME=production.example.com
```

Each hostname must belong to the stated operator-owned Cloudflare zone. These
are production examples, not required repository domains. The API renderer is
validated by the API preflight and deployment dry run. The web renderer is
validated separately by `deploy-web.mjs --dry-run`, which renders the web
Worker configuration. The legacy `sessionboard.namuh.co` addresses used for
sender identities and calendar UIDs are hosted defaults, not source-compiled
hosting requirements. Do not manually point a custom hostname at a
`workers.dev` address when using Cloudflare custom domains.

## Prerequisites and isolation

- Bun 1.3.14 (the version pinned by `packageManager`).
- A Cloudflare account with Workers, D1, Durable Objects, R2, and Queues enabled.
- An Airtable base and restricted personal access token only when the optional organization integration is enabled.
- An OpenSend sending-scoped key per environment. OpenSend is required by the current runtime, including local integrated development. Staging must be suppressed, sandboxed, or recipient-allowlisted.
- Access to the private Forge repository `jaeyunha/open-sessionboard`.

Keep local, staging, and production separate. Never copy an Airtable base/token, D1 database, R2 bucket, Queue, Better Auth secret, Cloudflare deployment token, or OpenSend key between environments. Staging data and delivery must never reach production resources or recipients.

## Local development

Install dependencies and create the ignored environment file:

```bash
bun install
cp .env.example .env
```

Use loopback addresses consistently for local browser, callback, and API configuration. Set at least:

```dotenv
APP_ENV=local
WEB_ORIGIN=http://127.0.0.1:3015
NEXT_PUBLIC_APP_ENV=local
NEXT_PUBLIC_APP_URL=http://127.0.0.1:3015
API_URL=http://127.0.0.1:8787
API_UPSTREAM_ORIGIN=http://127.0.0.1:8787
BETTER_AUTH_URL=http://127.0.0.1:8787
BETTER_AUTH_SECRET=<at-least-32-random-bytes>
OPENSEND_API_URL=http://127.0.0.1:8026
OPENSEND_API_KEY=local-development
AUTH_FROM_EMAIL=login@local.example.test
SPEAKERS_FROM_EMAIL=program@local.example.test
CALENDAR_FROM_EMAIL=schedule@local.example.test
CALENDAR_UID_DOMAIN=calendar.local.example.test
AI_PROVIDER=disabled
# Use AI_PROVIDER=openai and set this backend-only key to enable OpenAI.
OPENAI_API_KEY=<backend-only-openai-key>
OPENAI_MODEL=gpt-5.6-terra
OPENAI_AGENDA_MODEL=gpt-5.6-sol
OPENAI_EVALUATION_MODEL=gpt-5.6-sol
OPENAI_REMIX_MODEL=gpt-5.6-terra
OPENAI_AGENDA_REASONING_EFFORT=medium
OPENAI_EVALUATION_REASONING_EFFORT=medium
OPENAI_REMIX_REASONING_EFFORT=low
```

The angle-bracket values are operator placeholders, not credentials to commit.
The integrated runtime does not require or consume
`AIRTABLE_ACCESS_TOKEN`/`AIRTABLE_BASE_DEV_ID` at startup. Airtable
administration is composed only when its organization-scoped integration
configuration is enabled; manual PAT mode must also be explicitly enabled and
is not the hosted-production default.

Apply local D1 migrations and start both services from the repository root:

```bash
bunx wrangler d1 migrations apply DB --cwd apps/api --local
make dev
```

The deterministic personas below belong to the fixture runtime only; they are not seeded by the default integrated `make dev` runtime and do not exist in staging or production.

| Persona | Email | Password | Access |
| --- | --- | --- | --- |
| Organizer | `organizer@local.eventloom.test` | `organizer-local` | Organization administration and organizer evaluation work |
| Reviewer | `reviewer@local.eventloom.test` | `reviewer-local` | Only the seeded assigned-review workspace |
| Speaker | `speaker@local.eventloom.test` | `speaker-local` | Only the seeded speaker portal and CFP applicant flow |

To run the fixture API for deterministic persona checks, start it instead of the integrated API:

```bash
bun run --filter @eventloom/api dev:fixture
```

Run the web app separately with `NEXT_PUBLIC_RUNTIME_PROFILE=fixture`. Use organization `local-organization` and event `demo-event`. The fixture runtime does not grant a persona another role implicitly: reviewer and speaker sessions are denied organizer routes, and organizer membership does not grant the speaker portal.

`make dev` starts Mailpit through Docker Compose, the OpenSend-compatible loopback bridge, the API Worker, and the web app. Mailpit captures verification, magic-link, communication, and calendar messages:

- Inbox/API: `http://127.0.0.1:8025`
- SMTP: `127.0.0.1:1025`
- OpenSend-compatible bridge: `http://127.0.0.1:8026`

Check each service independently:

```bash
curl --fail http://127.0.0.1:3015/health
curl --fail http://127.0.0.1:8787/api/health
```

`API_UPSTREAM_ORIGIN` is the server-only API Worker destination used by the web `/api/*` proxy. In local, staging, and production, browsers always call same-origin `/api/*` through the web origin; the web Worker forwards those requests to the configured API origin. `NEXT_PUBLIC_APP_URL` remains browser-visible, while `API_URL` remains the API deployment/preflight origin; never expose or replace `API_UPSTREAM_ORIGIN` with a browser variable or a secret.

## Advisory AI providers

AI is not used to seed records. Set `AI_PROVIDER=disabled` or
`AI_PROVIDER=openai`. It runs only when an authorized user requests an agenda
or evaluation proposal locally, or an agenda, evaluation, or content-remix
proposal in the deployed Airtable runtime. OpenAI is optional only when
`AI_PROVIDER=disabled`; `OPENAI_API_KEY` is required when
`AI_PROVIDER=openai`. Non-AI workflows boot and operate with the provider
disabled.

Local `make dev` loads the ignored root `.env` into the API Worker with Wrangler `--env-file`; `AI_PROVIDER=openai` uses the OpenAI Responses API. `OPENAI_API_KEY` is backend-only: never put it in `NEXT_PUBLIC_*`, browser storage, logs, evidence, committed files, or Wrangler `[vars]`.

The provider adapter and local agenda lifecycle have opt-in real-API checks:

```bash
RUN_OPENAI_LIVE=1 bunx vitest run \
  apps/api/src/integrations/ai/openai.test.ts \
  apps/api/src/runtime/cloudflare-ai.test.ts
```

These synthetic checks prove the real Responses API adapter and local agenda proposal lifecycle. They do not replace deployed staging UI/API acceptance.

When `AI_PROVIDER=openai`, staging and production use OpenAI Responses and
the same quality-first per-feature defaults in `apps/api/wrangler.toml`:
Sol/medium for agenda and evaluation, Terra/low for remix.
`OPENAI_MODEL=gpt-5.6-terra` is the fallback for any future advisory feature
without an explicit override. Before deploying an environment with OpenAI,
store its distinct key as a Cloudflare secret:

```bash
bunx wrangler secret put OPENAI_API_KEY --cwd apps/api --env staging
```

Use a separate key and the corresponding `production` environment only after staging acceptance. Never add either key to `wrangler.toml`; rotate or delete a secret when AI is disabled.

## Cloudflare resources and API deployment

For staging and production, provision the environment-suffixed D1 database,
private R2 bucket, and outbox Queue named in `apps/api/wrangler.toml`. Put the
real `CLOUDFLARE_ACCOUNT_ID`, `D1_DATABASE_ID`, `WEB_ORIGIN`, `API_URL`,
`NEXT_PUBLIC_APP_URL`, and `API_UPSTREAM_ORIGIN` in that environment's ignored
file. Keep the binding names `DB`, `AGENDA_COORDINATOR`, `PRIVATE_FILES`, and
`OUTBOX_QUEUE` unchanged. The deployment script renders
`apps/api/wrangler.generated.toml` for the selected environment and never
modifies the committed template.

Copy `.env.cloudflare.example` to `.env.cloudflare-staging` and
`.env.cloudflare-production`. These files are ignored. Staging and production
deploys do not inherit provider credentials from the local root `.env`; export
`CLOUDFLARE_API_TOKEN` from the secret manager and put account, resource, and
origin identity in the selected Cloudflare environment file.

For production, preview the interactive Worker-secret installation plan:

```bash
bun run cloudflare:secrets:production -- --dry-run
```

Then export the Cloudflare deployment credential and run the installer:

```bash
export CLOUDFLARE_ACCOUNT_ID="<production account id>"
export CLOUDFLARE_API_TOKEN="<deployment token>"
bun run cloudflare:secrets:production
```

Wrangler owns every hidden-value prompt; the installer never reads, writes, or prints Worker
secret values. It installs `BETTER_AUTH_SECRET`, `OPENSEND_API_KEY`, `OPENAI_API_KEY`,
`AIRTABLE_OAUTH_CLIENT_SECRET`, `AIRTABLE_CREDENTIAL_ENCRYPTION_KEY`, and
`CACHE_INVALIDATION_TOKEN` on the API Worker, plus the same `CACHE_INVALIDATION_TOKEN` on the
web Worker. Enter the identical production cache token at both cache-token prompts.

The installer deliberately excludes `CLOUDFLARE_API_TOKEN`, `AIRTABLE_ACCESS_TOKEN`, and R2/AWS
access credentials because those authenticate deployment tooling or external providers rather
than application Workers.

For staging or manual installation, configure required Worker Secrets directly. Airtable
secrets are needed only for environments that enable the optional adapter. Never place these
values in Wrangler configuration or commit them:

```bash
for secret in \
  BETTER_AUTH_SECRET \
  CACHE_INVALIDATION_TOKEN; do
  bunx wrangler secret put "$secret" --cwd apps/api --env staging
done
```

Repeat with `--env production` and production-specific values. Add the required `OPENSEND_API_KEY` for each environment and
`OPENAI_API_KEY` when `AI_PROVIDER=openai`. Configure other integration secrets
from `.env.example` only when that integration is enabled.

Set `WEB_ORIGIN` to the web origin and `API_URL` to the API origin in the
corresponding ignored environment file. The generated Wrangler configuration
uses those values for `WEB_ORIGIN` and `API_ORIGIN`.

Validate and dry-run before a guarded API deployment:

```bash
node scripts/cloudflare/dry-run.mjs staging
node scripts/cloudflare/validate-config.mjs \
  --environment staging \
  --config apps/api/wrangler.generated.toml
node scripts/cloudflare/validate-config.mjs \
  --environment staging \
  --deployment \
  --config apps/api/wrangler.generated.toml
```

After migration compatibility, backup/recovery ownership, and release approval are recorded, the API deployment command is:

```bash
node scripts/cloudflare/deploy.mjs staging open-sessionboard:staging
```

Use `production open-sessionboard:production` for production. The command requires `CLOUDFLARE_API_TOKEN`, validates the configuration, applies remote D1 migrations, and then deploys the API Worker. A migration can succeed while the Worker deploy fails; stop and use the recorded recovery procedure rather than retrying blindly.

## Guarded web deployment

The web deploy script requires operator-supplied `NEXT_PUBLIC_APP_URL`,
server-only `API_UPSTREAM_ORIGIN`, and the deployment token for non-local
environments. Both URLs must be HTTPS origins. `API_UPSTREAM_ORIGIN` configures
the server-side proxy; browsers always use same-origin `/api/*` through
`NEXT_PUBLIC_APP_URL`.

A no-side-effect build/Wrangler check is available before the guarded deployment:

```bash
NEXT_PUBLIC_APP_URL='https://web-staging.example.com' \
API_UPSTREAM_ORIGIN='https://api-staging.example.com' \
node scripts/cloudflare/deploy-web.mjs staging --dry-run
```

Deploy staging only after the API and release gates authorize it. The shell guards prevent an accidental deployment without the token:

```bash
set -eu
export NEXT_PUBLIC_APP_URL='https://web-staging.example.com'
export API_UPSTREAM_ORIGIN='https://api-staging.example.com'
: "${CLOUDFLARE_API_TOKEN:?set the staging deployment token from the secret manager}"
node scripts/cloudflare/deploy-web.mjs staging open-sessionboard-web:staging
```

The production form is identical except for the pinned production origins and confirmation token:

```bash
set -eu
export NEXT_PUBLIC_APP_URL='https://your-production-web.example.com'
export API_UPSTREAM_ORIGIN='https://your-production-api.example.com'
: "${CLOUDFLARE_API_TOKEN:?set the production deployment token from the secret manager}"
node scripts/cloudflare/deploy-web.mjs production open-sessionboard-web:production
```

The web deployment receives the public app URL, server-only API upstream origin, and environment. Organization scope is resolved from authenticated memberships and organization-qualified routes. Never pass Airtable, OpenSend, Better Auth, or other private values to the web bundle.

## D1, optional Airtable, and OpenSend

D1 is authoritative. Drizzle owns typed schema/query definitions and schema
generation/checking; Wrangler is the only supported numbered migration application path:

```bash
bun run --cwd apps/api db:generate
bun run --cwd apps/api db:check
bunx wrangler d1 migrations apply DB --cwd apps/api --local
```

Do not mix `drizzle-kit migrate` with Wrangler's `d1_migrations` history. Airtable is
optional per organization and may be connected through OAuth or a scoped PAT. Missing
Airtable configuration must not prevent Worker boot.

For organization-scoped Airtable OAuth:

- Set `AIRTABLE_OAUTH_CLIENT_ID` in `.env.cloudflare-<environment>`.
- Store `AIRTABLE_OAUTH_CLIENT_SECRET` and a distinct
  `AIRTABLE_CREDENTIAL_ENCRYPTION_KEY` as API Worker secrets.
- Register the production callback exactly as
  `https://api.eventloom.namuh.co/api/integrations/airtable/oauth/callback`.
- Grant only `schema.bases:read`, `data.records:read`, `data.records:write`, and
  `webhook:manage`.
- Use a separate OAuth registration for local, staging, and production.

Hosted production stores organization-scoped OAuth credentials encrypted in D1 and does not use
the development `AIRTABLE_ACCESS_TOKEN` or development `AIRTABLE_BASE_ID`. Manual PAT connection
is an explicitly enabled self-hosting mode and is disabled by default in hosted production.

Migration and reconciliation CLIs:

```bash
node scripts/d1-airtable-migration/export/export.mjs --help
node scripts/d1-airtable-migration/import/import.mjs --help
node scripts/d1-airtable-migration/verify/cli.mjs --help
```

If an old local `.wrangler` database fails in an internal `_cf_*` table, preserve it and
use an isolated local persistence path rather than deleting user state.

Create an Airtable base only when that environment enables the optional adapter. D1 remains authoritative for organizations, events, CFPs, submissions, participants, reviews, sessions, agendas, CRM records, reports, and other program data. Airtable receives selected projections and controlled inbound fields; use synthetic records in staging and inspect a dry run before any schema mapping change.

OpenSend is the email and calendar delivery boundary. Configure and validate the
endpoint, credentials, sender identities, and calendar UID domain per deployment.
The current hosted defaults are `https://opensend.namuh.co`,
`auth@sessionboard.namuh.co`, `speakers@sessionboard.namuh.co`,
`calendar@sessionboard.namuh.co`, and `calendar.sessionboard.namuh.co`.
They aren't source-compiled requirements for self-hosting. Provider-side sender
verification and deliverability are not claimed by this repository. Calendar
messages are provider-neutral RFC 5545 attachments with a stable UID, increasing
`SEQUENCE`, and explicit IANA `TZID`; no calendar-provider account is configured
by this project.

HTTP-triggered delivery and Cloudflare Queue delivery must use the same validated
settings. Queue delivery adds persistence, retry, and dead-letter handling, but
it must not select a different endpoint, sender identity, credential, or calendar
UID domain.

## Evaluator state preparation

Evaluator preparation is separate from deployment and is never release evidence by itself. Use only an isolated local or staging environment, synthetic identities, and private files outside the repository. The canonical evaluator scope is organization `ai-engineer` and event `devflow-conf-2027`.

### Provision synthetic personas (mutating)

`provision-personas.mjs` creates Better Auth accounts and organization/event access through an injected D1 command adapter. It has no identity, password, origin, tenant, event, or adapter defaults. Supply four distinct synthetic personas and loopback or pinned HTTPS origins explicitly:

```bash
set -eu
export EVAL_ENVIRONMENT=staging
export EVAL_WEB_ORIGIN='https://web-staging.example.com'
export EVAL_API_ORIGIN='https://api-staging.example.com'
export EVAL_ORGANIZATION_ID='ai-engineer'
export EVAL_EVENT_ID='devflow-conf-2027'
: "${EVAL_D1_COMMAND_ADAPTER:?set the injected D1 adapter module path}"
: "${EVAL_ORGANIZER_EMAIL:?set a synthetic organizer email}"
: "${EVAL_ORGANIZER_PASSWORD:?set the synthetic organizer password}"
: "${EVAL_REVIEWER_EMAIL:?set a synthetic reviewer email}"
: "${EVAL_REVIEWER_PASSWORD:?set the synthetic reviewer password}"
: "${EVAL_SPEAKER_EMAIL:?set a synthetic speaker email}"
: "${EVAL_SPEAKER_PASSWORD:?set the synthetic speaker password}"
: "${EVAL_SUBMITTER_EMAIL:?set a synthetic submitter email}"
: "${EVAL_SUBMITTER_PASSWORD:?set the synthetic submitter password}"
node scripts/eval/provision-personas.mjs
```

The script writes its private evaluator config under `/tmp/killmysaas-evals/` by default and never prints credentials. Production requires the exact confirmation value enforced by the script; do not run it against production participant data.

### Seed Airtable (dry-run versus apply)

`seed-devflow.mjs` reads the official fixture and plans additive Airtable upserts for the canonical organization/event. `--dry-run` is the read-only/default plan; `--apply` performs POST/PATCH writes. Both require an explicit environment and Airtable credentials supplied by the operator:

```bash
set -eu
export EVAL_ENVIRONMENT=staging
export EVAL_ORGANIZATION_ID='ai-engineer'
export EVAL_EVENT_ID='devflow-conf-2027'
# Explicit canonical evaluator scope; do not substitute another tenant or event.
: "${AIRTABLE_ACCESS_TOKEN:?set the staging Airtable token from the secret manager}"
: "${AIRTABLE_BASE_ID:?set the staging Airtable base ID}"
node scripts/eval/seed-devflow.mjs --dry-run --full-chain
```

Apply only after reviewing the plan and approving the mutation:

```bash
node scripts/eval/seed-devflow.mjs --apply --full-chain
```

`--subset-fallback` is an explicit alternate fixture mode, not a substitute for the ordered browser workflow. Production apply additionally requires the script's exact `EVAL_PRODUCTION_CONFIRMATION=I_UNDERSTAND_PRODUCTION_DEVFLOW_SEEDING` value.

### Repair and read-only evaluator checks

`repair-devflow-production.mjs` is the canonical graph repair entry point. Keep the repair config and credential file private. The config must name the six synthetic identities `organizer-agenda`, `organizer-fixture`, `reviewer-sam`, `speaker-priya`, `speaker-marcus`, and `submitter`; do not copy real credentials into either file.

Prepare a manifest (reads and plans; no product writes), then inspect invariants (read-only):

```bash
set -eu
export EVAL_ENVIRONMENT=staging
export EVAL_ORGANIZATION_ID='ai-engineer'
export EVAL_EVENT_ID='devflow-conf-2027'
export EVAL_WEB_ORIGIN='https://web-staging.example.com'
export EVAL_API_ORIGIN='https://api-staging.example.com'
: "${EVAL_D1_COMMAND_ADAPTER:?set the injected D1 adapter module path}"
: "${AIRTABLE_ACCESS_TOKEN:?set the staging Airtable token from the secret manager}"
: "${AIRTABLE_BASE_ID:?set the staging Airtable base ID}"
REPAIR_CONFIG='/tmp/killmysaas-evals/devflow-repair-config.json'
REPAIR_CREDENTIALS='/tmp/killmysaas-evals/devflow-repair-credentials.json'
REPAIR_MANIFEST='/tmp/killmysaas-evals/devflow-repair-manifest.json'
node scripts/eval/repair-devflow-production.mjs --dry-run \
  --config "$REPAIR_CONFIG" --credentials "$REPAIR_CREDENTIALS" --manifest "$REPAIR_MANIFEST"
node scripts/eval/repair-devflow-production.mjs --invariants \
  --manifest "$REPAIR_MANIFEST" --config "$REPAIR_CONFIG" --credentials "$REPAIR_CREDENTIALS"
```

Apply or resume is mutating and requires the explicit confirmation accepted by the script:

```bash
node scripts/eval/repair-devflow-production.mjs --apply --confirm ai-engineer \
  --manifest "$REPAIR_MANIFEST" --config "$REPAIR_CONFIG" --credentials "$REPAIR_CREDENTIALS"
node scripts/eval/repair-devflow-production.mjs --resume --confirm ai-engineer \
  --manifest "$REPAIR_MANIFEST" --config "$REPAIR_CONFIG" --credentials "$REPAIR_CREDENTIALS"
```

`--reset-workflow` is a destructive repair phase and is not a routine release step. `scripts/eval/measure-overview-latency.mjs` is a separate read-only Airtable GET diagnostic that reads the repository `.env`; retain its output only as diagnostic evidence. None of these commands were run for this documentation change.

## Configuration checks

Before treating an environment as usable, verify that health responses identify the expected `APP_ENV`, CORS allows only the exact web origin with credentials, browser code contains no private values, tenant/API-key scopes cannot cross organizations, private files require expiring authorization, and staging delivery cannot reach production recipients. Release evidence and calendar lifecycle details are defined in [Deployment readiness](deployment-readiness.md), [Calendar semantics](calendar-semantics.md), [Browser QA](qa-runbook.md), and [Release runbook](release-runbook.md).
