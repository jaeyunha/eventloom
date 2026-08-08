# Environment and provider setup

This guide configures the separately deployed Next.js web application and Hono Worker API. It does not assert that any environment has been provisioned or deployed. Record real resource identifiers and verified URLs in the operator's secret manager or release evidence, not in this repository.

## Prerequisites

- Bun 1.3.14 (the version pinned by `packageManager`)
- A Cloudflare account with Workers, D1, Durable Objects, R2, and Queues enabled
- One Airtable base and restricted personal access token per environment
- An OpenSend sending-scoped key and verified `foreverbrowsing.com` sender identities
- Optional Google and Microsoft OAuth applications
- Optional Accelevents sandbox/production credentials
- Forge access to `jaeyunha/open-sessionboard`

Install dependencies and create the local environment file:

```bash
bun install
cp .env.example .env
```

Keep `.env` local. Do not paste provider secrets into issues, browser code, screenshots, terminal transcripts, Wrangler variables, or committed files.

## Isolation model

`local`, `staging`, and `production` are security boundaries, not labels for shared resources.

| Boundary | Local | Staging | Production |
| --- | --- | --- | --- |
| Airtable | Local/developer base with test records | Dedicated base with synthetic records only | Dedicated production base |
| D1 | `open-sessionboard-local` | `open-sessionboard-staging` | `open-sessionboard-production` |
| R2 | `open-sessionboard-private-files-local` | `open-sessionboard-private-files-staging` | `open-sessionboard-private-files-production` |
| Queue | `open-sessionboard-outbox-local` | `open-sessionboard-outbox-staging` | `open-sessionboard-outbox-production` |
| Worker | Local Wrangler process | `open-sessionboard-api-staging` | `open-sessionboard-api-production` |
| Web origin | `http://localhost:3015` | Dedicated staging host | Dedicated production host |
| API keys/OAuth | Test credentials | Separate non-production credentials | Production credentials |
| OpenSend | Captured or allowlisted recipients | Sandbox/suppressed delivery to allowlisted recipients | Verified production senders |
| Accelevents | Fake adapter | Sandbox event and key | Explicitly approved production event and key |

Never copy a D1 database, R2 bucket, Airtable base, API key, webhook secret, OAuth secret, OpenSend key, or Accelevents key between staging and production. Durable Object state is isolated by the environment-specific Worker deployment. Staging must not address production recipients or Accelevents events.

## Local application

Set at least these values in `.env`:

```dotenv
APP_ENV=local
WEB_ORIGIN=http://localhost:3015
NEXT_PUBLIC_APP_URL=http://localhost:3015
NEXT_PUBLIC_API_URL=http://localhost:8787
API_URL=http://localhost:8787
BETTER_AUTH_SECRET=<at-least-32-random-bytes>
AIRTABLE_ACCESS_TOKEN=<local-base-token>
AIRTABLE_BASE_ID=<local-base-id>
OPENSEND_API_URL=https://opensend.namuh.co
OPENSEND_API_KEY=<test-or-suppressed-sending-key>
AUTH_FROM_EMAIL=auth@foreverbrowsing.com
SPEAKERS_FROM_EMAIL=speakers@foreverbrowsing.com
CALENDAR_FROM_EMAIL=calendar@foreverbrowsing.com
```

Apply D1 migrations to the local Wrangler database from the API workspace, then start both deployables from the repository root:

```bash
bunx wrangler d1 migrations apply DB --cwd apps/api --local
make dev
```

Verify liveness independently:

```bash
curl --fail http://localhost:3015/health
curl --fail http://localhost:8787/api/health
```

A structured API `503 CONFIGURATION_ERROR` means the Worker is alive but its required environment is invalid. Fix configuration rather than bypassing validation.

## Cloudflare

### Token and account

The approved Cloudflare account is `7bcb73282d45e4294cc70dd3e2671bfb`. Use a short-lived or deployment-specific API token restricted to this account. It needs only the service-specific edit permissions used to provision and deploy the Worker, D1, Durable Objects, R2, and Queues. Confirm **D1 Edit** explicitly; a token without it cannot complete the migration/deployment script.

`CLOUDFLARE_API_TOKEN` belongs in the deployment environment. Do not add it to `apps/api/wrangler.toml`. The validator rejects secret-like Wrangler variables.

### Resources

For each non-local environment:

1. Create the environment's D1 database, private R2 bucket, and outbox Queue using the exact environment-suffixed names in `apps/api/wrangler.toml`.
2. Replace that environment's placeholder D1 `database_id` with the ID returned by Cloudflare.
3. Keep `DB`, `AGENDA_COORDINATOR`, `PRIVATE_FILES`, and `OUTBOX_QUEUE` binding names unchanged; application code depends on them.
4. Keep `workers_dev = false`. The committed Wrangler file intentionally declares no Worker route, so a non-local deploy is not reachable until an operator binds an environment-specific custom domain or route in Cloudflare. Configure that binding in the Cloudflare dashboard (or add and review an environment-specific Wrangler route) before deployment; do not enable `workers.dev` as a workaround.
5. Record the exact API hostname from that binding and use it for health checks, OAuth callbacks, the frontend's `NEXT_PUBLIC_API_URL`, and release evidence.
6. Confirm the Worker route's `WEB_ORIGIN` is the exact web origin, with no path or trailing wildcard.

The committed D1 migrations contain operational state only: identity/access, API keys, idempotency, webhook delivery, publication/audit indexes, and integration coordination. Airtable remains authoritative for program records.

### Secrets

Upload secrets separately for staging and production. Wrangler prompts for values without putting them on the command line:

```bash
bunx wrangler secret put BETTER_AUTH_SECRET --cwd apps/api --env staging
bunx wrangler secret put AIRTABLE_ACCESS_TOKEN --cwd apps/api --env staging
bunx wrangler secret put AIRTABLE_BASE_ID --cwd apps/api --env staging
bunx wrangler secret put OPENSEND_API_KEY --cwd apps/api --env staging
bunx wrangler secret put GOOGLE_CLIENT_SECRET --cwd apps/api --env staging
bunx wrangler secret put MICROSOFT_CLIENT_SECRET --cwd apps/api --env staging
bunx wrangler secret put ACCELEVENTS_API_KEY --cwd apps/api --env staging
```

Upload the corresponding non-secret provider IDs/URLs through the deployment platform's environment configuration. Repeat for production with production-specific values only. Optional provider secrets may be omitted when that adapter is disabled.

### Validate and deploy the API

Configuration validation and Wrangler dry-runs are safe preflight checks:

```bash
node scripts/cloudflare/validate-config.mjs --environment staging
node scripts/cloudflare/dry-run.mjs staging
```

The deployment form of validation deliberately fails while the D1 ID is a placeholder:

```bash
node scripts/cloudflare/validate-config.mjs --environment staging --deployment
```

The deploy script applies remote D1 migrations before deploying Worker code. Approve only additive migrations that the currently deployed Worker can safely run against, retain the migration output, verify a usable D1 backup/time-travel recovery point, and assign a recovery owner before execution. A successful dry-run does not prove database compatibility.

After the release gate authorizes a deployment, the guarded script applies remote D1 migrations and deploys the API Worker:

```bash
node scripts/cloudflare/deploy.mjs staging open-sessionboard:staging
```

If Worker deployment fails after migrations succeed, the previous Worker may remain active on the migrated schema. Keep the release private, stop retries, inspect the migration/deploy logs, and execute the preapproved database or Worker recovery path before attempting another deploy. Do not describe the environment as deployed until the bound API hostname passes health checks.

Production uses `production open-sessionboard:production`. This script deploys the API only. Configure and verify the Next.js deployment separately with `NEXT_PUBLIC_API_URL` pointing to the verified Worker origin; do not route provider credentials through Next.js.

## Airtable

Create a dedicated base for each environment. Restrict each personal access token to its one base and to the minimum record read/write plus schema-read capabilities required by the adapter.

The base is the sole writable authority for organizations, events, forms and fields, submissions, participants and profiles, evaluation plans/reviews/decisions, tasks, sessions, rooms, tracks, and agenda versions. D1 must not duplicate these records.

For every table:

- Include a dedicated application-owned ID field used by the mapper.
- Keep Airtable record IDs internal; they must never appear in public URLs or API records.
- Preserve version fields used for optimistic concurrency.
- Use linked records only where the typed adapter expects them.
- Apply schema changes deliberately to local, then staging, then production; never test a schema migration first against production.

Use synthetic email addresses and profiles in staging. Validate pagination, rate-limit retry, and duplicate application-ID behavior before approving a base.

## OpenSend

OpenSend is configured at `https://opensend.namuh.co`. Create separate sending-scoped keys for staging and production. Do not use an account-administration key in the Worker.

Verify SPF, DKIM, and DMARC for these identities before enabling production delivery:

- `auth@foreverbrowsing.com` — magic links and account verification
- `speakers@foreverbrowsing.com` — CFP, decision, reminder, and task mail
- `calendar@foreverbrowsing.com` — RFC 5545 invitation mail and organizer identity

Staging delivery must be suppressed, sandboxed, or recipient-allowlisted. Confirm bounce, complaint, and provider webhook visibility without sending to real program participants. Messages and calendar attachments carry idempotency keys so retries do not intentionally create duplicate sends.

## Google OAuth (optional)

Magic links and verified email remain required; Google is only a login convenience. Create a separate OAuth web application for each enabled environment.

Use the web origin as an authorized browser origin and the API origin callback:

```text
https://<api-host>/api/auth/callback/google
```

Set both `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` or neither. Partial credentials fail closed. Restrict consent scopes to identity (`openid`, email, and profile); calendar scopes are not required.

## Microsoft OAuth (optional)

Create a separate Microsoft Entra web application per environment and register:

```text
https://<api-host>/api/auth/callback/microsoft
```

Set both `MICROSOFT_CLIENT_ID` and `MICROSOFT_CLIENT_SECRET` or neither. Choose the narrowest supported account tenancy for the product and request identity scopes only. Open Sessionboard does not write through Microsoft Graph Calendar.

## Accelevents (optional outbound publication)

Create a distinct sandbox key/event for staging and a production key/event for production. Restrict the key to the event, speaker, and agenda/session capabilities required for outbound upserts when the provider supports such scoping.

Configure `ACCELEVENTS_API_BASE_URL` and `ACCELEVENTS_API_KEY` only in the API environment. Publication is intentionally one way:

1. Open Sessionboard reads an immutable published agenda revision and accepted speaker projections.
2. The integration creates a mapped preview and diff.
3. An organizer explicitly confirms the exact snapshot and confirmation token.
4. The service performs idempotent speaker and session upserts.
5. Operators inspect per-record failures and reconciliation state before retrying.

Never import Accelevents changes into Airtable and never allow an automatic agenda publish to bypass preview/confirmation. Rotating a key must not alter saved source records or idempotency receipts.

## Post-configuration checks

Before considering an environment usable:

- Health responses identify the expected `APP_ENV` and include a trace ID.
- CORS allows only the exact configured web origin with credentials.
- Browser code contains only `NEXT_PUBLIC_*` URLs, never provider secrets.
- A test API key cannot cross its organization or exceed its scopes.
- A private upload cannot be fetched without an authorized, expiring grant.
- Airtable program records never appear in D1.
- Staging email and Accelevents actions cannot reach production recipients/events.
- Logs, error responses, admin status pages, and screenshots expose no secret values.

Calendar lifecycle behavior is specified in [Calendar semantics](calendar-semantics.md). Release approval is specified in [Release runbook](release-runbook.md).
