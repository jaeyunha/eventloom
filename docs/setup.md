# Environment and deployment setup

Open Sessionboard has two separately deployed services: a Next.js web Worker and a Hono API Worker. This guide describes the repository's current configuration and the operator procedures; it does not claim that an environment has been provisioned, deployed, or release-verified. Keep resource IDs and all secret values in the operator's secret manager or in ignored environment files.

## Scope and current origins

The built-in Speaker CRM is supported first-party product scope. Accelevents is a separate external event-platform integration, not the built-in CRM, and is unsupported by the current runtime; it has no credentials, setup, preflight, QA, monitoring, or release step here. Interactive authentication is Better Auth email/password plus verified email and one-time email links.

The current deployment contract is pinned to these origins:

| Environment | Web origin | API origin | Current hosting state |
| --- | --- | --- | --- |
| Local | `http://127.0.0.1:3015` | `http://127.0.0.1:8787` | Local processes; browser uses same-origin `/api/*` through the web proxy |
| Staging | `https://open-sessionboard-web-staging.ashleyha0317.workers.dev` | `https://open-sessionboard-api-staging.ashleyha0317.workers.dev` | Cloudflare Workers with `workers_dev = true` |
| Production | `https://open-sessionboard-web-production.ashleyha0317.workers.dev` | `https://open-sessionboard-api-production.ashleyha0317.workers.dev` | Cloudflare Workers with `workers_dev = true` |

`https://sessionboard.namuh.co` (web) and `https://api.sessionboard.namuh.co` (API) are the recommended future stable public contract. DNS, Worker bindings, cookies, CORS, callbacks, and health checks for those names are **pending**; do not use them as current origins or claim that routes are configured. The pinned Workers origins remain the only deployment inputs accepted by the current scripts.

## Prerequisites and isolation

- Bun 1.3.14 (the version pinned by `packageManager`).
- A Cloudflare account with Workers, D1, Durable Objects, R2, and Queues enabled.
- A dedicated Airtable base and restricted personal access token per environment.
- An OpenSend sending-scoped key per environment. Staging must be suppressed, sandboxed, or recipient-allowlisted.
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
AIRTABLE_ACCESS_TOKEN=<local-base-token>
AIRTABLE_BASE_ID=<local-base-id>
OPENSEND_API_URL=https://opensend.namuh.co
OPENSEND_API_KEY=<local-or-suppressed-sending-key>
AUTH_FROM_EMAIL=auth@sessionboard.namuh.co
SPEAKERS_FROM_EMAIL=speakers@sessionboard.namuh.co
CALENDAR_FROM_EMAIL=calendar@sessionboard.namuh.co
AI_PROVIDER=openai
OPENAI_API_KEY=<backend-only-openai-key>
OPENAI_MODEL=gpt-5.6-terra
OPENAI_AGENDA_MODEL=gpt-5.6-sol
OPENAI_EVALUATION_MODEL=gpt-5.6-sol
OPENAI_REMIX_MODEL=gpt-5.6-terra
OPENAI_AGENDA_REASONING_EFFORT=medium
OPENAI_EVALUATION_REASONING_EFFORT=medium
OPENAI_REMIX_REASONING_EFFORT=low
```

The angle-bracket values are operator placeholders, not credentials to commit. Apply local D1 migrations and start both services from the repository root:

```bash
bunx wrangler d1 migrations apply DB --cwd apps/api --local
make dev
```

The deterministic personas below belong to the fixture runtime only; they are not seeded by the default integrated `make dev` runtime and do not exist in staging or production.

| Persona | Email | Password | Access |
| --- | --- | --- | --- |
| Organizer | `organizer@local.open-sessionboard.test` | `organizer-local` | Organization administration and organizer evaluation work |
| Reviewer | `reviewer@local.open-sessionboard.test` | `reviewer-local` | Only the seeded assigned-review workspace |
| Speaker | `speaker@local.open-sessionboard.test` | `speaker-local` | Only the seeded speaker portal and CFP applicant flow |

To run the fixture API for deterministic persona checks, start it instead of the integrated API:

```bash
bun run --filter @open-sessionboard/api dev:fixture
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

AI is not used to seed records. It runs only when an authorized user requests an agenda or evaluation proposal locally, or an agenda, evaluation, or content-remix proposal in the deployed Airtable runtime. Non-AI workflows boot and operate when no provider is configured.

Local `make dev` loads the ignored root `.env` into the API Worker with Wrangler `--env-file`; `AI_PROVIDER=openai` uses the OpenAI Responses API. `OPENAI_API_KEY` is backend-only: never put it in `NEXT_PUBLIC_*`, browser storage, logs, evidence, committed files, or Wrangler `[vars]`.

The provider adapter and local agenda lifecycle have opt-in real-API checks:

```bash
RUN_OPENAI_LIVE=1 bunx vitest run \
  apps/api/src/integrations/ai/openai.test.ts \
  apps/api/src/runtime/cloudflare-ai.test.ts
```

These synthetic checks prove the real Responses API adapter and local agenda proposal lifecycle. They do not replace deployed staging UI/API acceptance.

Staging and production are configured with OpenAI Responses and the same quality-first per-feature defaults in `apps/api/wrangler.toml`: Sol/medium for agenda and evaluation, Terra/low for remix. `OPENAI_MODEL=gpt-5.6-terra` is the fallback for any future advisory feature without an explicit override. Before deploying either environment, store its distinct OpenAI key as a Cloudflare secret:

```bash
bunx wrangler secret put OPENAI_API_KEY --cwd apps/api --env staging
```

Use a separate key and the corresponding `production` environment only after staging acceptance. Never add either key to `wrangler.toml`; rotate or delete a secret when AI is disabled.

## Cloudflare resources and API deployment

For staging and production, provision the environment-suffixed D1 database, private R2 bucket, and outbox Queue named in `apps/api/wrangler.toml`, then replace only the target environment's placeholder D1 ID with the real ID. Keep the binding names `DB`, `AGENDA_COORDINATOR`, `PRIVATE_FILES`, and `OUTBOX_QUEUE` unchanged. The committed staging and production Worker environments intentionally keep `workers_dev = true` and the pinned origins above.
Set `WEB_ORIGIN` to the web origin and `API_ORIGIN` to the API origin in the corresponding Wrangler environment; both values must remain the exact pinned origins above.

Validate and dry-run before a guarded API deployment:

```bash
node scripts/cloudflare/validate-config.mjs --environment staging
node scripts/cloudflare/dry-run.mjs staging
node scripts/cloudflare/validate-config.mjs --environment staging --deployment
```

After migration compatibility, backup/recovery ownership, and release approval are recorded, the API deployment command is:

```bash
node scripts/cloudflare/deploy.mjs staging open-sessionboard:staging
```

Use `production open-sessionboard:production` for production. The command requires `CLOUDFLARE_API_TOKEN`, validates the configuration, applies remote D1 migrations, and then deploys the API Worker. A migration can succeed while the Worker deploy fails; stop and use the recorded recovery procedure rather than retrying blindly.

## Guarded web deployment

The web deploy script accepts only the pinned Workers origins for non-local environments. It requires the exact `NEXT_PUBLIC_APP_URL`, server-only `API_UPSTREAM_ORIGIN`, and deployment token. `API_UPSTREAM_ORIGIN` is validated as the API Worker origin and configured for the server-side proxy; browsers always use same-origin `/api/*` through the browser-visible `NEXT_PUBLIC_APP_URL`. Organization scope comes from authenticated memberships and organization-qualified routes, not a browser deployment variable.

A no-side-effect build/Wrangler check is available before the guarded deployment:

```bash
NEXT_PUBLIC_APP_URL='https://open-sessionboard-web-staging.ashleyha0317.workers.dev' \
API_UPSTREAM_ORIGIN='https://open-sessionboard-api-staging.ashleyha0317.workers.dev' \
node scripts/cloudflare/deploy-web.mjs staging --dry-run
```

Deploy staging only after the API and release gates authorize it. The shell guards prevent an accidental deployment without the token:

```bash
set -eu
export NEXT_PUBLIC_APP_URL='https://open-sessionboard-web-staging.ashleyha0317.workers.dev'
export API_UPSTREAM_ORIGIN='https://open-sessionboard-api-staging.ashleyha0317.workers.dev'
: "${CLOUDFLARE_API_TOKEN:?set the staging deployment token from the secret manager}"
node scripts/cloudflare/deploy-web.mjs staging open-sessionboard-web:staging
```

The production form is identical except for the pinned production origins and confirmation token:

```bash
set -eu
export NEXT_PUBLIC_APP_URL='https://open-sessionboard-web-production.ashleyha0317.workers.dev'
export API_UPSTREAM_ORIGIN='https://open-sessionboard-api-production.ashleyha0317.workers.dev'
: "${CLOUDFLARE_API_TOKEN:?set the production deployment token from the secret manager}"
node scripts/cloudflare/deploy-web.mjs production open-sessionboard-web:production
```

The web deployment receives the public app URL, server-only API upstream origin, and environment. Organization scope is resolved from authenticated memberships and organization-qualified routes. Never pass Airtable, OpenSend, Better Auth, or other private values to the web bundle.

## Airtable and OpenSend

Create and provision a dedicated Airtable base for each environment. Airtable remains authoritative for organizations, events, CFPs, submissions, participants, reviews, sessions, agendas, CRM records, reports, and other program data; D1 stores identity/access and operational indexes. Use synthetic records in staging and inspect a dry run before any additive schema apply.

OpenSend is the email and calendar delivery boundary at `https://opensend.namuh.co`. Use these exact sender identities:

- `auth@sessionboard.namuh.co` for verification and account mail.
- `speakers@sessionboard.namuh.co` for CFP, decision, reminder, task, and organizer-group mail.
- `calendar@sessionboard.namuh.co` for calendar invitations, updates, and cancellations.

Provider-side sender verification and deliverability are not claimed by this repository. Calendar messages are provider-neutral RFC 5545 attachments with a stable UID, increasing `SEQUENCE`, and explicit IANA `TZID`; no calendar-provider account is configured by this project.

## Evaluator state preparation

Evaluator preparation is separate from deployment and is never release evidence by itself. Use only an isolated local or staging environment, synthetic identities, and private files outside the repository. The canonical evaluator scope is organization `ai-engineer` and event `devflow-conf-2027`.

### Provision synthetic personas (mutating)

`provision-personas.mjs` creates Better Auth accounts and organization/event access through an injected D1 command adapter. It has no identity, password, origin, tenant, event, or adapter defaults. Supply four distinct synthetic personas and loopback or pinned HTTPS origins explicitly:

```bash
set -eu
export EVAL_ENVIRONMENT=staging
export EVAL_WEB_ORIGIN='https://open-sessionboard-web-staging.ashleyha0317.workers.dev'
export EVAL_API_ORIGIN='https://open-sessionboard-api-staging.ashleyha0317.workers.dev'
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
export EVAL_WEB_ORIGIN='https://open-sessionboard-web-staging.ashleyha0317.workers.dev'
export EVAL_API_ORIGIN='https://open-sessionboard-api-staging.ashleyha0317.workers.dev'
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
