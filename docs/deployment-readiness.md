# Deployment readiness preflight

The release preflight is read-only. It checks configuration, provider isolation, Cloudflare access, and Forge privacy; it never deploys, migrates D1, writes provider data, or changes repository visibility. A passing result is evidence for the release runbook, not authorization to deploy or publish.

## Inputs and secret handling

Prepare one ignored environment file per boundary. `.env.*` is ignored by Git; keep these files outside the repository when the operator environment supports that. Never attach them to release evidence.

```text
.env.release-local
.env.release-staging
.env.release-production
```

Each file must contain the core application and provider keys represented in `.env.example`:

- application environment, web/API origins, and a dedicated `BETTER_AUTH_SECRET`
- Cloudflare account, deployment token, D1 database ID, R2 bucket, and Queue
- one Airtable token/base pair
- OpenSend URL, sending key, and the three sender addresses
- complete Google, Microsoft, and Accelevents pairs when those optional adapters are enabled

The preflight compares values in memory and reports only key names and environment names. It never writes or prints a configured value. Local, staging, and production must have distinct Better Auth secrets, Cloudflare deployment tokens, D1 IDs, R2 buckets, Queues, Airtable tokens/bases, OpenSend keys, and enabled provider credentials. Origins must also be distinct, and non-local origins must use HTTPS. The Cloudflare account and provider API base URLs may be shared when the provider intentionally hosts every isolated resource in one account or endpoint.

The selected environment is checked against `apps/api/wrangler.toml`. `WEB_ORIGIN`, account ID, D1 ID, R2 bucket, and Queue must match exactly. A staging or production placeholder D1 ID is a hard failure.

### Optional provider decision

An optional provider must be either absent or configured as a complete pair:

| Provider | Complete pair |
| --- | --- |
| Google OAuth | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` |
| Microsoft OAuth | `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET` |
| Accelevents | `ACCELEVENTS_API_BASE_URL`, `ACCELEVENTS_API_KEY` |

Pass `--require-providers google,microsoft,accelevents` with the exact adapters enabled for the release. A named provider then fails when disabled. The script validates presence, pair completeness, HTTPS, and cross-environment credential isolation. Operators must still retain provider-side evidence for OAuth callback/scopes, OpenSend sender verification and suppression mode, and the staging Accelevents sandbox event; those facts cannot be proven from configuration presence alone.

## Cloudflare credentials and permissions

The selected environment needs a deployment token in `CLOUDFLARE_API_TOKEN`. Set `CLOUDFLARE_TOKEN_KIND=user` for a user API token (the default) or `account` for an account-owned token. Restrict it to the approved account and grant only:

- Workers Scripts Edit
- D1 Edit
- Workers R2 Storage Edit
- Queues Edit

Cloudflare's token-policy API may return these Edit permissions as `Workers Scripts Write`, `D1 Write`, `Workers R2 Storage Write`, and `Queues Write`. The preflight accepts those API names, verifies all four permissions, and rejects a permission policy that is not restricted to the configured account.

**D1 Edit is required.** The deployment script applies remote migrations before deploying the Worker. A D1 resource GET proves only read access and is not enough. The preflight therefore inspects the deployment token's policy and requires `D1 Edit`/`D1 Write` explicitly. A token without it can pass a resource lookup but will fail migration; that is a release stop condition.

Token-policy inspection uses a separate `CLOUDFLARE_API_AUDIT_TOKEN`, supplied through the operator environment rather than committed files. Give that audit credential only the API-token read permission needed to inspect the selected user or account token. It must not receive deployment permissions. The deployment token itself performs read-only probes for the exact D1 database, R2 bucket, and Queue declared in Wrangler. Durable Object creation is part of Worker deployment and has no separate preflight mutation.

## Forge privacy credential

Set these only in the operator environment or selected ignored environment file:

```dotenv
FORGE_API_URL=https://forge.smol.ai
FORGE_REPOSITORY=jaeyunha/open-sessionboard
FORGE_API_TOKEN=<repository-read-token>
```

The token needs repository read access only. The preflight calls Forge's repository GET endpoint and fails unless the exact repository reports `private: true`. It never calls a repository update endpoint. Do not grant the preflight token repository administration or visibility-write access.

## Commands

Run the static validation first. It reads all three environment files so it can detect shared resources and credentials:

```bash
node scripts/release/preflight.mjs \
  --environment staging \
  --env local=.env.release-local \
  --env staging=.env.release-staging \
  --env production=.env.release-production \
  --require-providers google,microsoft,accelevents \
  --offline
```

`--offline` exits successfully after configuration checks but reports `"ready": false` because Cloudflare and Forge were not observed. For the online release check, export the two read-only audit credentials when they are not already in the selected ignored file, then omit `--offline`:

```bash
export CLOUDFLARE_API_AUDIT_TOKEN='<from-secret-manager>'
export FORGE_API_TOKEN='<from-secret-manager>'
node scripts/release/preflight.mjs \
  --environment staging \
  --env local=.env.release-local \
  --env staging=.env.release-staging \
  --env production=.env.release-production \
  --require-providers google,microsoft,accelevents
```

Exactly one `--env` may use `-` to read that environment from the current process instead of a file. This is useful in CI:

```bash
node scripts/release/preflight.mjs \
  --environment staging \
  --env local=.env.release-local \
  --env staging=- \
  --env production=.env.release-production
```

The script emits one JSON object. `"ready": true` means configuration, isolation, token policy, Cloudflare resource reads, and Forge privacy all passed for the selected environment. Failures contain a stable code and a sanitized message. Store that JSON with the release commit evidence, then continue the independent migration, route/domain, provider-side, automated, CUA, security, performance, and rollback gates in the release runbook.

Run the focused implementation test without contacting providers:

```bash
node --test scripts/release/preflight.test.mjs
```
