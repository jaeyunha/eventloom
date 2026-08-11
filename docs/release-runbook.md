# Release and competition submission runbook

This is an operator-controlled gate. Documentation, source coverage, a passing preflight, or a local test run does not mean Open Sessionboard is deployed, public, or submitted. Every claim must be tied to one clean candidate commit, one environment, and an observable artifact.

The governing specification lists the competition deadline as **Wednesday, August 12, 2026 at 10:00 PM Pacific Time**. Recheck the organizer's current portal deadline, timezone, and required fields before submission; do not rely on a local clock assumption.

## Current and pending hosting contract

Staging and production currently run separately deployed web and API Workers at these pinned origins, with `workers_dev = true`:

| Environment | Web | API |
| --- | --- | --- |
| Staging | `https://open-sessionboard-web-staging.ashleyha0317.workers.dev` | `https://open-sessionboard-api-staging.ashleyha0317.workers.dev` |
| Production | `https://open-sessionboard-web-production.ashleyha0317.workers.dev` | `https://open-sessionboard-api-production.ashleyha0317.workers.dev` |

`sessionboard.namuh.co` (web) and `api.sessionboard.namuh.co` (API) are recommended future stable names. DNS, routes, cookies, CORS, callbacks, health checks, and evidence for them are **pending**. They are not release URLs yet; the current pinned Workers origins remain the only release inputs.

## Stop conditions

Keep both intentional Forge and GitHub mirrors private and stop the release when any of the following is true:

- The candidate SHA is dirty, unidentified, or not the commit whose evidence is attached.
- Local automated evidence is missing/failing, or required staging Ever/`codex-cua` evidence is missing, stale, or based on mocks.
- A staging or production D1 ID is a placeholder, resources or secrets are shared across boundaries, or staging can reach production data or recipients.
- Cloudflare token policy lacks Workers Scripts Edit, D1 Edit, R2 Edit, or Queues Edit, or migration compatibility/backup recovery is unreviewed.
- A deployed health origin, `WEB_ORIGIN`, API origin, CORS policy, auth callback, or same-origin web proxy does not match the pinned current contract.
- Tenant isolation, private-data handling, email/calendar idempotency, webhook signatures, publication locking, rollback, or API error safety fails.
- Sender verification/suppression evidence, real OpenSend delivery evidence, or required Airtable/D1 boundary observations are missing.
- Security, accessibility, performance, rollback ownership, evaluator accounts, license, walkthrough, or submission assets are not ready.
- A credential, magic link, private browser recording, generated build, secret-bearing environment file, or unrelated unreviewed work is present.

The event-platform integration that is outside the supported product scope is not a release gate. The built-in Speaker CRM is supported scope and must be included in the organizer evidence. A waiver is not a pass; fix and re-run the affected gate.

## Release evidence header

Create an operator-owned record outside the repository containing:

- Candidate version, commit SHA, clean/dirty result, UTC start time, release owner, and rollback owner.
- Local, staging, and production web/API origins, plus the observed `workers_dev` state.
- Cloudflare Worker deployment/version IDs and D1/R2/Queue names/IDs (never tokens).
- Airtable base labels/IDs and data classification (never tokens).
- OpenSend URL, sender verification state, staging suppression/allowlist state, delivery IDs, and redacted message headers.
- Evaluator seed/repair manifest version and synthetic identity keys (never passwords or inbox contents).
- Local Playwright/axe report paths explicitly labeled local.
- Staging Ever session IDs, staging `codex-cua` target/app state, and redacted screenshots explicitly labeled staging.
- Real Airtable, D1, R2, Queue, OpenSend, webhook, and calendar observations; distinguish each from unit fakes.
- Preflight JSON, migration compatibility/backup evidence, deployment log references, rollback plan, Forge/GitHub privacy observations, and final go/no-go approvals.

## 1. Candidate and repository integrity

From a clean checkout of the candidate, record:

```bash
git status --short
git rev-parse HEAD
git remote -v
git log --oneline --decorate -n 20
sf repo get jaeyunha/open-sessionboard
```

Accept only when the candidate status is clean, the intended Forge and GitHub mirror remotes are present, both mirrors are private, the license is AGPL-3.0-or-later, and no `.env`, Wrangler state, secrets, test results, browser profile, recording, or generated build is tracked. Do not require a sole Forge remote or remove the intentional GitHub mirror as part of release preparation.

## 2. Automated and local browser evidence

Install from the lockfile and run the repository's automated gate on the candidate:

```bash
bun install --frozen-lockfile
make build
make all
```

The automated Playwright/axe artifacts from this command are local or CI evidence. Label them with the local loopback target (`http://127.0.0.1:3015` and `http://127.0.0.1:8787`) and do not present them as staging evidence. Do not suppress warnings, skip authentication, weaken assertions, or convert a timeout into a pass.

## 3. Read-only preflight and migration review

Run the read-only release preflight without an optional-provider requirement:

```bash
node scripts/release/preflight.mjs \
  --environment staging \
  --env local=.env.release-local \
  --env staging=.env.release-staging \
  --env production=.env.release-production \
  --offline
```

Repeat online with `CLOUDFLARE_API_AUDIT_TOKEN` and `FORGE_API_TOKEN` from the secret manager and no `--offline`. The preflight must confirm exact pinned `WEB_ORIGIN`, real D1 IDs, environment-suffixed R2/Queue resources, isolated Airtable/OpenSend credentials, account-restricted token policy, migration readiness, and both mirrors' private status. It does not deploy or seed.

Inspect D1 migrations before any mutation. Retain the compatibility analysis, a usable backup/time-travel recovery point, migration output, and a named recovery owner. A dry run or preflight cannot prove that a migrated schema is compatible with the currently deployed Worker.

## 4. Staging deployment and acceptance

After preflight and migration approval, deploy the API Worker with the guarded script:

```bash
node scripts/cloudflare/deploy.mjs staging open-sessionboard:staging
```

The command requires `CLOUDFLARE_API_TOKEN`, validates the deployment configuration, applies remote D1 migrations, and deploys the Worker. If migration succeeds while deployment fails, stop, keep the mirrors private, and execute the recorded recovery path before retrying.

Deploy the web Worker from the identical candidate commit. The script requires the exact public URL inputs and an explicit tenant ID:

```bash
set -eu
export NEXT_PUBLIC_APP_URL='https://open-sessionboard-web-staging.ashleyha0317.workers.dev'
export NEXT_PUBLIC_API_URL='https://open-sessionboard-api-staging.ashleyha0317.workers.dev'
: "${NEXT_PUBLIC_ORGANIZATION_ID:?set the explicit staging organization application ID}"
: "${CLOUDFLARE_API_TOKEN:?set the staging deployment token from the secret manager}"
node scripts/cloudflare/deploy-web.mjs staging open-sessionboard-web:staging
```

For non-local deployment, the script validates the supplied API Worker origin, then injects the web origin as the browser-visible API base and sets `API_UPSTREAM_ORIGIN` to the API Worker. Verify that `/api/*` same-origin requests, API CORS, auth cookies, and callbacks all use the observed pinned origins.

Verify the exact staging origins before browser work:

```bash
curl --fail https://open-sessionboard-web-staging.ashleyha0317.workers.dev/health
curl --fail https://open-sessionboard-api-staging.ashleyha0317.workers.dev/api/health
curl --fail https://open-sessionboard-api-staging.ashleyha0317.workers.dev/api/v1/openapi.json
```

Then run the seeded workflow from [Browser QA](qa-runbook.md) against the real rendered staging build:

1. CFP configuration, conditional fields, account verification, draft resume, participant add, submit, and retry.
2. Speaker portal ownership, profile, tasks, files/forms, and acceptance-gated content.
3. Multi-round human review, blind fields, advisory AI confirmation/edit, decision, communication, and reports.
4. Built-in CRM contact/import/filter/tag/custom-field/history/duplicate/merge behavior.
5. Agenda conflict checks, warning override, immutable publication, rollback, embeds, JSON/iCal, API keys, and signed/retrying webhooks.
6. OpenSend status plus one real controlled calendar request/update/cancel sequence.
7. Keyboard, screen-reader, CUA focus/spatial checks, narrow/wide layouts, loading/empty/error/forbidden/retry states.

Ever and `codex-cua` must use synthetic identities and the deployed staging origin. Local Playwright results cannot substitute for these sessions. Evidence must show the real isolated Airtable/D1/R2/Queue/OpenSend/webhook boundaries, not mocked routes.

## 5. Security, privacy, performance, and known gaps

Before production, inspect staging evidence for cross-tenant and cross-user denials, sanitized rich text, private non-cacheable assets, scoped API keys, webhook replay/deduplication, publication locks, immutable public projections, and Airtable/D1 authority boundaries. Exercise and record request errors, Queue/outbox lag, Airtable retries/rate limits, OpenSend bounces/complaints, webhook delivery, and calendar failure signals with alert ownership.

Use reproducible reports for the governing budgets:

| Budget | Target |
| --- | --- |
| Public LCP | ≤ 1.5 s at p75 |
| INP | ≤ 200 ms |
| CLS | ≤ 0.1 |
| Cached API reads | ≤ 300 ms at p95 |
| Ordinary API writes | ≤ 1 s at p95 |
| Airtable-backed workflows | ≤ 2 s at p95 |

Two calendar behaviors are known implementation gaps, not delivered features: event-timezone changes do not yet have a complete draft migration/revalidation/new-publication flow, and the API does not yet map DST-specific resolver failures to stable public error codes. Record these as limitations; do not claim them as passing release behavior or hide them behind unit-level resolver tests.

## 6. Production deployment and bounded smoke

Production requires a recorded go approval after staging, security, accessibility, performance, migration, rollback, and real-provider evidence are complete. Deploy the API from the identical candidate:

```bash
node scripts/cloudflare/deploy.mjs production open-sessionboard:production
```

Deploy the web Worker with production-only public inputs and the matching confirmation token:

```bash
set -eu
export NEXT_PUBLIC_APP_URL='https://open-sessionboard-web-production.ashleyha0317.workers.dev'
export NEXT_PUBLIC_API_URL='https://open-sessionboard-api-production.ashleyha0317.workers.dev'
: "${NEXT_PUBLIC_ORGANIZATION_ID:?set the explicit production organization application ID}"
: "${CLOUDFLARE_API_TOKEN:?set the production deployment token from the secret manager}"
node scripts/cloudflare/deploy-web.mjs production open-sessionboard-web:production
```

Do not call an environment deployed or verified until the observed pinned origins serve the expected candidate Worker and web build. Perform only bounded production smoke with dedicated demo fixtures:

- health, trace/request headers, cache policy, and exact-origin CORS;
- email-link path to a designated demo account using controlled delivery;
- organizer, reviewer, and speaker role landing pages;
- one read-only published speaker/agenda embed at narrow and wide viewport;
- one scoped read-only API-key call;
- one controlled webhook test delivery and redacted status view;
- production OpenSend/calendar status with no real participant broadcast.

Do not replay the full staging dataset into production or mutate a live agenda as a smoke test. Keep both mirrors private until the final visibility gate.

## 7. Final release gate

Check every item against the same production candidate:

- [ ] Candidate SHA is clean and all evidence paths identify that SHA.
- [ ] Current staging/production web and API origins match the pinned Workers values and observed `workers_dev = true` state.
- [ ] Future stable domain names are clearly marked pending; no evidence claims DNS or routes are configured.
- [ ] Automated local/CI checks and local Playwright/axe evidence passed without skipped or softened assertions.
- [ ] Read-only preflight and migration compatibility/recovery review passed.
- [ ] API and web deployments, health checks, CORS, cookies, and same-origin proxy behavior were observed.
- [ ] Staging Ever and `codex-cua` evidence passed on the candidate with synthetic identities.
- [ ] Real Airtable, D1, R2, Queue, OpenSend, webhook, and calendar boundary evidence is attached separately from local fakes.
- [ ] CFP, portal, review, human decision, CRM, agenda/publication, embeds/API, security, accessibility, and performance scenarios passed.
- [ ] Calendar request/update/cancel evidence shows one stable UID and no duplicate event.
- [ ] Known timezone-migration and DST-specific API error-mapping gaps are recorded as gaps, not claimed as delivered behavior.
- [ ] Rollback and monitoring owners are active; secrets and private artifacts are absent.
- [ ] Demo accounts, license, evaluator walkthrough, screenshots/video, and competition fields are final and redacted.

Any unchecked item is a no-go and the mirrors remain private.

## 8. Final visibility transition

Public visibility is the final release action, never a development step:

1. Re-run the read-only Forge and GitHub visibility observations and attach the private-state output.
2. Obtain recorded final approval with every release item checked.
3. Using the supported authenticated provider controls, change visibility only for the intentionally selected public mirror(s). Do not change ownership, default branch, history, or remotes.
4. Immediately re-read visibility for every mirror changed and record operator, UTC time, command/UI evidence, and public URL.
5. Confirm unauthenticated readers can see only the intended repository, README, source, and AGPL license, with no secrets or private artifacts.

If visibility cannot be verified, treat the product as unreleased. If a private artifact or credential is exposed, stop submission, return affected mirrors to private, rotate the credential, remove the exposure at its source, and repeat the gate on a new candidate.

## 9. Competition submission checklist

- [ ] Product name and one-sentence program-workflow value proposition.
- [ ] Production web URL and health-checked API origin from the observed pinned deployment.
- [ ] Public repository URL(s) and AGPL-3.0-or-later license.
- [ ] Demo organizer, reviewer, and speaker accounts/instructions delivered through a secure channel.
- [ ] Evaluator walkthrough follows CFP → portal → review → CRM → agenda → publication → embeds/API.
- [ ] OpenAPI link points to the verified production runtime document.
- [ ] Screenshots/video are from the release commit and contain no private data or secrets.
- [ ] Cloudflare, Airtable, Forge, OpenSend, API, accessibility, security, and performance evidence is included without unsupported claims.
- [ ] Known limitations match the current contract, including pending stable domains and calendar implementation gaps.
- [ ] Submission title, description, URLs, credentials, category, contact fields, deadline, and timezone were reviewed by a second person.
- [ ] Portal confirmation/receipt and UTC submission time are retained.

After submission, monitor request errors, Queue/outbox lag, webhook delivery, Airtable retries, OpenSend bounces/complaints, and calendar failure state. Post-submission monitoring does not replace the pre-release gate.
