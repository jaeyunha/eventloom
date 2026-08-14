# Deployment readiness preflight

## D1 and optional Airtable

- Apply and verify numbered D1 migrations before Worker deployment.
- Verify that normal Worker boot and traffic do not require Airtable variables.
- Treat D1 as authoritative for product and operational state. Airtable is an
  optional per-organization integration, not a fallback or deployment
  requirement.
- When Airtable is enabled, isolate credentials and bases by environment and
  organization, and verify projection/reconciliation separately.

The release preflight is a read-only configuration and privacy check. It reads
the selected environment files, compares isolation and rendered Wrangler
resources, and optionally reads Cloudflare resources. It never deploys, applies
migrations, writes Airtable or OpenSend data, provisions evaluator identities,
changes repository visibility, or proves that a product workflow has passed.

## Hosting configuration

Staging and production origins are supplied by their ignored environment
files. Production uses `workers_dev = false`, so the four custom-domain route
keys are required and must match the deployed origins:

```dotenv
API_HOSTNAME=api.production.example.com
API_ZONE_NAME=production.example.com
WEB_HOSTNAME=web.production.example.com
WEB_ZONE_NAME=production.example.com
```

These are production examples. Each hostname must belong to its operator-owned
Cloudflare zone. The API preflight and API dry run render and validate the API
Worker configuration. The web dry run renders and validates the separate web
Worker configuration. The public Wrangler templates contain `.example.invalid`
origins, zero UUIDs, and stable binding/resource names. Deployment scripts
render the selected environment into ignored generated Wrangler files, which
must never be committed.

## Inputs and secret handling

Keep one ignored file per boundary, outside the repository when possible:

```text
.env.release-local
.env.release-staging
.env.release-production
```

Each file must contain the non-secret configuration names required by `scripts/release/preflight.mjs`:

- `APP_ENV`, `WEB_ORIGIN`, `NEXT_PUBLIC_APP_URL`, `API_UPSTREAM_ORIGIN`, and `API_URL`.
- `API_HOSTNAME`, `API_ZONE_NAME`, `WEB_HOSTNAME`, and `WEB_ZONE_NAME` for production custom-domain routing.
- `BETTER_AUTH_SECRET` (at least 32 random bytes) and `BETTER_AUTH_URL`.
- `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, `D1_DATABASE_ID`, `R2_BUCKET_NAME`, and `QUEUE_NAME`.
- `AIRTABLE_OAUTH_CLIENT_ID`, `AIRTABLE_OAUTH_CLIENT_SECRET`, and
  `AIRTABLE_CREDENTIAL_ENCRYPTION_KEY` when hosted organization-scoped Airtable OAuth is enabled.
  Register the environment's exact static callback and keep OAuth clients distinct across local,
  staging, and production.
- `AIRTABLE_ACCESS_TOKEN` and `AIRTABLE_BASE_ID` only for explicitly enabled manual
  PAT/self-hosting mode. Development PATs and development bases must never enter hosted
  production.
- `OPENSEND_API_URL`, `OPENSEND_API_KEY`, `AUTH_FROM_EMAIL`,
  `SPEAKERS_FROM_EMAIL`, `CALENDAR_FROM_EMAIL`, and `CALENDAR_UID_DOMAIN`.
  OpenSend is required by the current runtime, not an optional provider. Validate
  sender identities and the UID domain for the deployment rather than assuming
  hosted defaults.
- `AI_PROVIDER=disabled|openai`. OpenAI is optional only when it is disabled;
  `OPENAI_API_KEY` is required when `AI_PROVIDER=openai`.
- `OPENAI_MODEL`, `OPENAI_AGENDA_MODEL`, `OPENAI_EVALUATION_MODEL`, and
  `OPENAI_REMIX_MODEL` when the OpenAI advisory provider is configured.
- For the web renderer, the operator-owned route `pattern` and `zone_name` when
  a custom domain is used. The hosted `eventloom.namuh.co` route is only an
  example.

Use each environment's configured API origin for `API_UPSTREAM_ORIGIN`,
`API_URL`, and `BETTER_AUTH_URL` in these preflight inputs.
`API_UPSTREAM_ORIGIN` is server-only: browsers always call same-origin
`/api/*` through the browser-visible `NEXT_PUBLIC_APP_URL`, and the web Worker
forwards those requests to the API Worker. `API_URL` remains the API
deployment/preflight origin. Do not print values or attach environment files to
evidence.

The preflight requires distinct secrets, D1 IDs, R2 buckets, Queues, OpenSend keys, and origins across local, staging, and production. Airtable credentials are distinct when the optional integration is enabled. It rejects placeholders, cross-environment sharing, non-HTTPS non-local URLs, Wrangler mismatches, and a staging/production placeholder D1 ID. Staging must contain synthetic records and suppressed or allowlisted delivery behavior.

## Cloudflare and Forge permissions

The deployment token in `CLOUDFLARE_API_TOKEN` is separate from the read-only audit token in `CLOUDFLARE_API_AUDIT_TOKEN`. The deployment token is restricted to the configured account and needs Workers Scripts Edit, D1 Edit, Workers R2 Storage Edit, and Queues Edit. D1 Edit is required because the later deployment script applies remote migrations. The audit token only reads token policy and is never used for deployment.

The Forge variables are operator-only:

```dotenv
FORGE_API_URL=https://forge.smol.ai
FORGE_REPOSITORY=jaeyunha/open-sessionboard
FORGE_API_TOKEN=<repository-read-token>
```

The online preflight performs a repository GET and verifies that Forge reports
the exact configured repository identity. It accepts private or public
visibility and does not call a visibility update endpoint. GitHub and Forge
visibility changes remain separate owner-controlled actions.

## Commands

Run the offline configuration check first. It reads all three files and deliberately reports `"ready": false` because Cloudflare and Forge were not observed:

```bash
node scripts/release/preflight.mjs \
  --environment staging \
  --env local=.env.release-local \
  --env staging=.env.release-staging \
  --env production=.env.release-production \
  --offline
```

For the online check, supply the read-only audit credentials from the secret manager and omit `--offline`:

```bash
export CLOUDFLARE_API_AUDIT_TOKEN='<cloudflare-token-policy-read-token>'
export FORGE_API_TOKEN='<forge-repository-read-token>'
node scripts/release/preflight.mjs \
  --environment staging \
  --env local=.env.release-local \
  --env staging=.env.release-staging \
  --env production=.env.release-production
```

No `--require-providers` argument is needed for the supported product configuration. In particular, do not add unsupported provider names to this command. Exactly one `--env` value may be `-` to read that boundary from the current process:

```bash
node scripts/release/preflight.mjs \
  --environment staging \
  --env local=.env.release-local \
  --env staging=- \
  --env production=.env.release-production
```

The script emits one sanitized JSON object. `configurationValid: true` means the files and Wrangler inventory passed static checks. HTTP-triggered and Queue delivery must resolve the same validated OpenSend, sender, credential, and calendar UID settings. `ready: true` additionally requires the online Cloudflare and Forge checks plus any migration-readiness input. A passing preflight is evidence for the release runbook, not deployment or end-to-end evidence. Evaluator seed, persona provisioning, and graph repair are separate procedures in [Environment and provider setup](setup.md).
