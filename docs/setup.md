# Environment and provider setup

This guide configures the separately deployed Next.js web application and Hono Worker API. It does not assert that any environment has been provisioned or deployed. Record real resource identifiers and verified URLs in the operator's secret manager or release evidence, not in this repository.

## Prerequisites

- Bun 1.3.14 (the version pinned by `packageManager`)
- A Cloudflare account with Workers, D1, Durable Objects, R2, and Queues enabled
- One Airtable base and restricted personal access token per environment
- An OpenSend sending-scoped key and verified `foreverbrowsing.com` sender identities
- A Google OAuth web application per environment
- Microsoft OAuth and Accelevents are intentionally not part of this build; do not provision their applications, credentials, callbacks, or adapter configuration.
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

Never copy a D1 database, R2 bucket, Airtable base, API key, webhook secret, OAuth secret, or OpenSend key between staging and production. Durable Object state is isolated by the environment-specific Worker deployment. Staging must not address production recipients.

## Local application

Set at least these values in `.env`:

```dotenv
APP_ENV=local
WEB_ORIGIN=http://localhost:3015
NEXT_PUBLIC_APP_URL=http://localhost:3015
NEXT_PUBLIC_API_URL=http://localhost:8787
API_URL=http://localhost:8787
BETTER_AUTH_SECRET=<at-least-32-random-bytes>
GOOGLE_CLIENT_ID=<local-google-client-id>
GOOGLE_CLIENT_SECRET=<local-google-client-secret>
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
```

Upload the corresponding non-secret provider IDs/URLs through the deployment platform's environment configuration. Repeat for production with production-specific values only. Google OAuth client IDs and secrets are required per environment; do not add disabled-provider credentials or settings.

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

Create a dedicated base for each environment. Restrict each personal access token to its one base. The runtime adapter needs record read/write access; the schema provisioner additionally needs the `schema.bases:write` scope (which includes schema reads). A token without that scope fails clearly before any schema mutation.

The base is the sole writable authority for organizations, events, forms and fields, submissions, participants and profiles, evaluation plans/reviews/decisions, tasks, sessions, rooms, tracks, agenda versions/entries, publication outbox, and audit records. D1 must not duplicate these records.

Provision the additive schema from the repository root after loading the target environment's variables:

```bash
node scripts/airtable/provision.mjs --dry-run
node scripts/airtable/provision.mjs --apply
```

Dry-run is the safe default and performs only a metadata read. Apply is explicit, creates or reconciles the approved tables and fields, and is safe to repeat. It never deletes or renames tables/fields and leaves unmanaged tables (including an initial `Table 1`) untouched. Run against local, then staging, then production; inspect the dry-run output at each boundary and never provision production first.

For every table:

- Include a dedicated application-owned ID field used by the mapper. Application IDs must be unique; Airtable record IDs remain internal.
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
Calendar delivery remains provider-neutral: send RFC 5545 REQUEST, UPDATE, and CANCEL messages through OpenSend with stable UID, increasing SEQUENCE, and explicit IANA TZID. Include room and video details when present; no calendar-provider OAuth is required.

## Google OAuth (required)

Magic links and verified email remain required; Google OAuth is the supported social login and is required for each enabled environment. Create a separate OAuth web application for each environment.

Use the web origin as an authorized browser origin and the API origin callback:

```text
https://<api-host>/api/auth/callback/google
```

Set both `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in every enabled environment; partial credentials fail closed. Restrict consent scopes to identity (`openid`, email, and profile); calendar scopes are not required.

## Post-configuration checks

Before considering an environment usable:

- Health responses identify the expected `APP_ENV` and include a trace ID.
- CORS allows only the exact configured web origin with credentials.
- Browser code contains only `NEXT_PUBLIC_*` URLs, never provider secrets.
- A test API key cannot cross its organization or exceed its scopes.
- A private upload cannot be fetched without an authorized, expiring grant.
- Airtable program records never appear in D1.
- Staging email actions cannot reach production recipients.
- Logs, error responses, admin status pages, and screenshots expose no secret values.

Calendar lifecycle behavior is specified in [Calendar semantics](calendar-semantics.md). Release approval is specified in [Release runbook](release-runbook.md).
