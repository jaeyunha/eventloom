# Deployment readiness preflight

The release preflight is a read-only configuration and privacy check. It reads the selected environment files, compares isolation and Wrangler resources, optionally reads Cloudflare resources, and confirms that Forge remains private. It never deploys, applies migrations, writes Airtable or OpenSend data, provisions evaluator identities, changes repository visibility, or proves that a product workflow has passed.

## Current and pending hosting

Staging and production currently use the pinned Workers origins below. Their API and web Wrangler environments have `workers_dev = true`; this is the expected current state, not a failure.

| Environment | Web | API |
| --- | --- | --- |
| Staging | `https://open-sessionboard-web-staging.ashleyha0317.workers.dev` | `https://open-sessionboard-api-staging.ashleyha0317.workers.dev` |
| Production | `https://open-sessionboard-web-production.ashleyha0317.workers.dev` | `https://open-sessionboard-api-production.ashleyha0317.workers.dev` |

`https://sessionboard.namuh.co` and `https://api.sessionboard.namuh.co` are recommended future stable web/API domains. DNS, Worker routes, cookies, CORS, callbacks, health checks, and release evidence for them are **pending**. The preflight must not require those names and must not claim that they are configured.

## Inputs and secret handling

Keep one ignored file per boundary, outside the repository when possible:

```text
.env.release-local
.env.release-staging
.env.release-production
```

Each file must contain the non-secret configuration names required by `scripts/release/preflight.mjs`:

- `APP_ENV`, `WEB_ORIGIN`, `NEXT_PUBLIC_APP_URL`, `API_UPSTREAM_ORIGIN`, and `API_URL`.
- `BETTER_AUTH_SECRET` (at least 32 random bytes) and `BETTER_AUTH_URL`.
- `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, `D1_DATABASE_ID`, `R2_BUCKET_NAME`, and `QUEUE_NAME`.
- `AIRTABLE_ACCESS_TOKEN` and `AIRTABLE_BASE_ID` for that boundary.
- `OPENSEND_API_URL`, `OPENSEND_API_KEY`, `AUTH_FROM_EMAIL`, `SPEAKERS_FROM_EMAIL`, and `CALENDAR_FROM_EMAIL`.

Use the exact pinned API origin for `API_UPSTREAM_ORIGIN`, `API_URL`, and `BETTER_AUTH_URL` in these preflight inputs. `API_UPSTREAM_ORIGIN` is server-only: browsers always call same-origin `/api/*` through the browser-visible `NEXT_PUBLIC_APP_URL`, and the web Worker forwards those requests to the API Worker. `API_URL` remains the API deployment/preflight origin. Do not print values or attach environment files to evidence.

The preflight requires distinct secrets, D1 IDs, R2 buckets, Queues, Airtable credentials, OpenSend keys, and origins across local, staging, and production. It rejects placeholders, cross-environment sharing, non-HTTPS non-local URLs, Wrangler mismatches, and a staging/production placeholder D1 ID. Staging must contain synthetic records and suppressed or allowlisted delivery behavior.

## Cloudflare and Forge permissions

The deployment token in `CLOUDFLARE_API_TOKEN` is separate from the read-only audit token in `CLOUDFLARE_API_AUDIT_TOKEN`. The deployment token is restricted to the configured account and needs Workers Scripts Edit, D1 Edit, Workers R2 Storage Edit, and Queues Edit. D1 Edit is required because the later deployment script applies remote migrations. The audit token only reads token policy and is never used for deployment.

The Forge variables are operator-only:

```dotenv
FORGE_API_URL=https://forge.smol.ai
FORGE_REPOSITORY=jaeyunha/open-sessionboard
FORGE_API_TOKEN=<repository-read-token>
```

The online preflight performs a repository GET and fails unless Forge reports the repository as private. It does not call a visibility update endpoint. Forge and GitHub mirrors are both intentional during development; both remain private until the separate final release gate.

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

The script emits one sanitized JSON object. `configurationValid: true` means the files and Wrangler inventory passed static checks. `ready: true` additionally requires the online Cloudflare and Forge checks plus any migration-readiness input. A passing preflight is evidence for the release runbook, not deployment or end-to-end evidence. Evaluator seed, persona provisioning, and graph repair are separate procedures in [Environment and provider setup](setup.md).
