# Release and competition submission runbook

This is an operator-controlled gate. Completing documentation or implementation does not mean Open Sessionboard is deployed, publicly visible, or submitted. Record every command result, URL, and approval against the exact release commit.

The competition deadline in the governing specification is **Wednesday, August 12, 2026 at 10:00 PM Pacific Time**. Confirm the organizer's current portal deadline/timezone before the final submission; do not rely on a local clock assumption.

## Stop conditions

Keep the Forge repository private and stop the release when any of these is true:

- the release commit is dirty, unidentified, or not the commit under test
- required automated, Ever, or `codex-cua` evidence is missing/failing/stale
- a staging/production resource still has a placeholder ID or shared secret/data boundary
- Cloudflare D1 Edit or another required deployment permission is absent
- the environment has no verified Worker custom domain/route while `workers_dev` is disabled
- a D1 migration lacks a tested compatibility and backup/time-travel recovery path
- staging can reach production Airtable, recipients, API keys, webhooks, or Accelevents events
- a tenant-isolation, private-data, authentication, webhook-signature, idempotency, schedule-conflict, or calendar-duplication check fails
- performance/accessibility budgets fail
- production URLs, demo accounts, license, walkthrough, or rollback owner are not ready
- the repository contains a credential, private browser recording, generated build output, or unreviewed unrelated work

A waiver is not a pass. Fix and re-run the affected gate.

## Release evidence header

Create an operator-owned release record outside the source repository with:

- release candidate version and commit SHA
- UTC start time and named release/rollback owners
- local/staging/production web and API origins
- Cloudflare resource IDs/names (no secrets)
- Airtable base labels/IDs (no tokens) and data classification
- OpenSend sender verification state and sandbox/production mode
- Accelevents sandbox/production event identifier
- automated test artifacts
- Ever session IDs and redacted evidence paths
- CUA target application, bridge state, and redacted evidence paths
- deployment IDs/log references
- Forge visibility observations before and after the gate
- final go/no-go approvals and UTC timestamps

## 1. Candidate and repository integrity

From a clean checkout of the candidate:

```bash
git status --short
git rev-parse HEAD
git remote -v
git rev-list --max-parents=0 HEAD
git log --reverse --format='%H %s'
sf repo get jaeyunha/open-sessionboard
```

Accept only when:

- `git status --short` is empty.
- The sole remote is `https://forge.smol.ai/jaeyunha/open-sessionboard.git`; no GitHub remote remains.
- Exactly one root commit exists and it is the clean project baseline preceding focused implementation commits.
- Forge reports the repository as private.
- `LICENSE` is AGPL-3.0-or-later and README/product links resolve.
- `.env`, Wrangler local state, secrets, test results, browser profiles/recordings, and generated builds are untracked and absent from history.

Do not rewrite, squash, or replace the approved clean-root history during release preparation.

## 2. Automated gates

Install from the lockfile, build both deployables, and run the complete check/test gate on the candidate:

```bash
bun install --frozen-lockfile
make build
make all
```

Retain unabridged output or CI links. `make build` proves both deployables bundle; `make all` runs typecheck/lint/format checks, unit/integration/API/security tests, and Playwright E2E. Confirm tests explicitly cover:

- API 400/401/403/404/conflict/precondition/internal error envelopes
- tenant and speaker ownership isolation
- CORS exact-origin behavior
- XSS/injection and private-data exposure
- API-key scopes/revocation and idempotency conflicts
- webhook signatures/retries and secret redaction
- agenda hard conflicts, warning overrides, concurrent version conflicts, publication, and rollback
- DST nonexistent/ambiguous time handling
- calendar REQUEST/UPDATE/CANCEL sequence and client fixtures
- axe WCAG 2.1 AA scans and keyboard flows without skipped authentication fixtures

No warning or failure may be suppressed and no assertion may be weakened.

## 3. Cloudflare and provider preflight

Validate every selected API environment before mutation:

```bash
node scripts/cloudflare/validate-config.mjs --environment staging --deployment
node scripts/cloudflare/dry-run.mjs staging
node scripts/cloudflare/validate-config.mjs --environment production --deployment
node scripts/cloudflare/dry-run.mjs production
```

Then inspect provider isolation using [Environment and provider setup](setup.md):

- D1 IDs are real and unique; D1/R2/Queue names end in the environment name.
- Durable Object and Queue bindings resolve in each Worker environment.
- `WEB_ORIGIN` is the exact matching web origin and HTTPS outside local.
- A verified environment-specific Worker custom domain/route is bound; the committed Wrangler file has `workers_dev = false` and no route of its own.
- Airtable bases/tokens are distinct; staging contains synthetic data only.
- OpenSend staging is suppressed/sandboxed/allowlisted; production senders have verified SPF, DKIM, and DMARC.
- Optional OAuth credentials are complete pairs and request identity scopes only.
- Accelevents staging uses a sandbox event/key and production remains explicit outbound-only.
- No secret is present in Wrangler variables, the web bundle, logs, API responses, screenshots, or status UI.

Inspect D1 migrations before applying them. The guarded deploy script rejects placeholder D1 IDs, then applies migrations before deploying the Worker. Prove every migration is safe for the currently deployed Worker, retain migration output, verify a usable D1 backup/time-travel recovery point, and record the recovery owner/procedure. Dry-run success alone is insufficient.

## 4. Staging deployment and acceptance

With the staging token supplied by the deployment environment and the migration compatibility/recovery evidence approved:

```bash
node scripts/cloudflare/deploy.mjs staging open-sessionboard:staging
```

If migration succeeds but Worker deployment fails, stop. The previous Worker may be running against the migrated schema; keep Forge private and execute the recorded recovery procedure before retrying or claiming a deployment.

Deploy the frontend through its configured Cloudflare project using the same candidate commit, with `NEXT_PUBLIC_API_URL` set to the verified staging Worker. The repository's guarded script deploys only the API; retain the frontend platform deployment ID separately.

Verify:

```bash
curl --fail https://<staging-web-host>/health
curl --fail https://<staging-api-host>/api/health
curl --fail https://<staging-api-host>/api/v1/openapi.json
```

Confirm the API health environment is `staging`, trace/request headers are present, cache policy is safe, and CORS accepts only the staging web origin.

Run the complete seeded workflow described in [Browser interaction and accessibility QA](qa-runbook.md):

1. conditional CFP configuration/publication
2. verified account, draft resume, multiple participants, submit/retry
3. routing into multi-round review
4. human confirmation/edit of AI assistance and human final decision
5. acceptance-created speaker tasks/files/forms
6. private agenda with hard conflict and audited warning override
7. immutable publication and rollback behavior
8. OpenSend status and one updateable/cancellable calendar event
9. accessible speaker/agenda embeds plus JSON/iCal projections
10. scoped public API and signed/retrying webhook
11. Accelevents preview, exact confirmation, sandbox upsert, failure/retry/reconciliation

Both Ever and `codex-cua` must exercise the real rendered staging build. Authentication fixtures must be used, not skipped. Attach evidence to the candidate commit.

## 5. Security, privacy, and performance

Before production, inspect the staging build and evidence for:

- cross-tenant and cross-user denials reveal no existence/private fields
- public widgets/API projections omit evaluator notes, private files, task state, email, and unapproved profiles/sessions
- rich text is sanitized on input and output
- asset grants are authorized, short-lived, and non-cacheable
- provider/API/webhook secrets are write-only/redacted
- webhook receiver validation covers signature, timestamp replay policy, and delivery deduplication
- publication revalidates under a lock; hard conflicts cannot race through
- public surfaces read only current immutable revisions
- Airtable owns program data while D1 contains operational state only

Meet the governing budgets using reproducible reports:

| Budget | Required result |
| --- | --- |
| Public LCP | ≤ 1.5 s at p75 |
| INP | ≤ 200 ms |
| CLS | ≤ 0.1 |
| Cached API reads | ≤ 300 ms at p95 |
| Ordinary API writes | ≤ 1 s at p95 |
| Airtable-backed workflows | ≤ 2 s at p95 |

Also confirm monitoring for request errors, webhook delivery, Queue/outbox lag, Airtable retries/rate limits, bounces/complaints, calendar failure, and Accelevents failure. A screenshot of a dashboard without an alert path is not sufficient; record a synthetic failure and observed signal.

## 6. Production deployment

Production deployment requires recorded go approval from the release owner after staging, security, accessibility, performance, provider checks, and a production-specific migration compatibility/recovery review pass.

```bash
node scripts/cloudflare/deploy.mjs production open-sessionboard:production
```

The same migration-before-Worker failure stop applies in production. Do not proceed to frontend deployment or smoke checks until the bound API host serves the new healthy Worker.

Deploy the frontend from the identical candidate commit with production-only public URLs. Verify health and the public OpenAPI document at the exact production origins. Use dedicated production smoke fixtures; do not replay the full synthetic staging dataset into production.

Perform a bounded production smoke:

- health, request tracing, headers, and exact-origin CORS
- magic-link path to a designated demo account
- organizer/reviewer/speaker role landing pages
- one read-only published speaker/agenda embed at narrow and wide viewport
- one scoped read-only API-key call
- webhook test delivery to the designated release receiver
- provider status pages showing redacted configuration

Do not publish a new Accelevents production program, email real attendees, or mutate a live agenda as a smoke test unless the release owner explicitly selected that synthetic production fixture.

Record deployment IDs, health bodies, UTC time, and smoke evidence. The words “deployed” or “verified” belong in a release receipt only after these observations exist.

## 7. Final release gate

All boxes must be checked against the production candidate:

- [ ] Clean candidate SHA and single approved root history recorded
- [ ] Forge still private and sole remote verified
- [ ] `make build` and `make all` passed without skipped/softened assertions
- [ ] Staging and production configuration/deployment preflights passed
- [ ] Complete seeded end-to-end flow passed
- [ ] Ever evidence passed on the candidate
- [ ] `codex-cua` evidence passed on the candidate
- [ ] Unit, API contract, security, accessibility, performance, and E2E evidence passed
- [ ] Calendar update/cancel produces one client event across required client fixtures
- [ ] Public embeds/API expose only approved published projections
- [ ] Accelevents production action remains explicit preview/confirm and source records stay unchanged
- [ ] Monitoring and rollback owners are active
- [ ] Production URL and evaluator demo accounts work
- [ ] OpenAPI, setup, calendar, QA, and release documentation match the delivered build
- [ ] AGPL license and evidence provenance are present
- [ ] Submission narrative, screenshots/video, and evaluator walkthrough are final and redacted
- [ ] Competition portal deadline/timezone and required fields were rechecked

Any unchecked item is a no-go and the repository remains private.

## 8. Forge private-to-public transition

Public visibility is the final release-gate action, not a development step.

1. Re-run `sf repo get jaeyunha/open-sessionboard` and attach the private-state output.
2. Obtain the recorded final go approval with every item above checked.
3. In Forge repository settings (or the exact supported `sf repo update` form displayed by the installed authenticated CLI), change only `jaeyunha/open-sessionboard` visibility from private to public. Do not change ownership, default branch, history, or remotes.
4. Immediately run:

   ```bash
   sf repo get jaeyunha/open-sessionboard
   ```

5. Confirm Forge reports public visibility and an unauthenticated browser can read the repository, README, source, and AGPL license without exposing actions/artifacts/secrets.
6. Record operator, UTC timestamp, command/UI evidence, and public repository URL.

If visibility cannot be verified, treat the repository as not released. If it was made public early or a secret/private artifact is discovered, stop submission, return visibility to private through Forge settings, rotate affected credentials, remove the exposure at its source, and repeat the full gate on a new candidate. Never rewrite or force-push release history as an improvised cleanup.

## 9. Competition submission checklist

- [ ] Product name and one-sentence program-workflow value proposition
- [ ] Production web URL and health-checked API origin
- [ ] Public Forge URL: `https://forge.smol.ai/jaeyunha/open-sessionboard`
- [ ] Source license: AGPL-3.0-or-later
- [ ] Demo organizer, reviewer, and speaker accounts/instructions delivered through a secure channel
- [ ] Evaluator walkthrough follows CFP → portal → review → agenda → publication → embeds/API → Accelevents
- [ ] OpenAPI link points to the verified production runtime document
- [ ] Screenshots/video are from the release commit and contain no private data or secrets
- [ ] Cloudflare, Airtable, Forge, OpenSend, public API, accessibility, and performance evidence is included without unsupported claims
- [ ] Known limitations match intentional non-goals: no CRM/marketing, payments, sponsors/exhibitors, transcription, multilingual workflow, direct provider calendar writes, or two-way Accelevents sync
- [ ] Submission title, description, URLs, credentials, category, and contact fields are reviewed by a second person
- [ ] Portal confirmation/receipt and UTC submission time are retained

After submission, monitor production errors, Queue/outbox lag, webhook delivery, OpenSend bounces/complaints, Airtable retries, and Accelevents failures. Post-submission monitoring does not replace any pre-release gate.
