# Release and competition submission runbook

This is an operator-controlled gate. Documentation, source coverage, a passing preflight, or a local test run does not mean Eventloom is deployed, public, or submitted. Every claim must be tied to one clean candidate commit, one environment, and an observable artifact.

The out-of-tree competition brief recorded a submission deadline of
**Wednesday, August 12, 2026 at 10:00 PM Pacific Time**. That timestamp has
passed. Treat submission availability as unknown until the organizer's current
portal, timezone, and required fields are observed directly.

## Hosting contract

Staging and production run separate web and API Workers. Their account,
resource IDs, and HTTPS origins are supplied by ignored environment files and
must match the observed candidate deployment. Production uses
`workers_dev = false`, so each production environment must also set the four
custom-domain route keys:

```dotenv
API_HOSTNAME=api.production.example.com
API_ZONE_NAME=production.example.com
WEB_HOSTNAME=web.production.example.com
WEB_ZONE_NAME=production.example.com
```

These are production examples. Each hostname must belong to its operator-owned
Cloudflare zone. The API preflight and API dry run validate the API renderer;
the web deployment dry run validates the separate web renderer. The current
hosted production web example is `https://eventloom.namuh.co`; staging web and
all API origins remain operator-supplied and must not be inferred from that
hostname.

## Production Worker secrets

Preview the production installation plan before any external write:

```bash
bun run cloudflare:secrets:production -- --dry-run
```

For the approved live operation, export the non-secret account ID and
`CLOUDFLARE_API_TOKEN` from the secret manager, then run:

```bash
export CLOUDFLARE_ACCOUNT_ID="<production account id>"
export CLOUDFLARE_API_TOKEN="<deployment token>"
bun run cloudflare:secrets:production
```

Wrangler prompts for every value and the installer never persists or prints secrets. It installs
the API secrets `BETTER_AUTH_SECRET`, `OPENSEND_API_KEY`, `OPENAI_API_KEY`,
`AIRTABLE_OAUTH_CLIENT_SECRET`, `AIRTABLE_CREDENTIAL_ENCRYPTION_KEY`, and
`CACHE_INVALIDATION_TOKEN`, then installs the same cache token on the web Worker. The Cloudflare
deployment token, Airtable PATs, and R2/AWS access keys are intentionally not application Worker
secrets and must not be added by this workflow.

## Stop conditions

Stop the release when any of the following is true:

- The candidate SHA is dirty, unidentified, or not the commit whose evidence is attached.
- Local automated evidence is missing/failing, or required staging Ever/`codex-cua` evidence is missing, stale, or based on mocks.
- A staging or production D1 ID is a placeholder, resources or secrets are shared across boundaries, or staging can reach production data or recipients.
- Cloudflare token policy lacks Workers Scripts Edit, D1 Edit, R2 Edit, or Queues Edit, or migration compatibility/backup recovery is unreviewed.
- A deployed health origin, `WEB_ORIGIN`, API origin, CORS policy, auth callback, or same-origin web proxy does not match the selected environment file.
- Tenant isolation, private-data handling, email/calendar idempotency, webhook signatures, publication locking, rollback, or API error safety fails.
- Sender verification/suppression evidence, real OpenSend delivery evidence, or
  required D1 boundary observations are missing. When Airtable is enabled and
  composed into the candidate runtime, its required boundary evidence is also
  missing.
- Security, accessibility, performance, rollback ownership, evaluator accounts, license, walkthrough, or submission assets are not ready.
- A credential, magic link, private browser recording, generated build, secret-bearing environment file, or unrelated unreviewed work is present.

The event-platform integration that is outside the supported product scope is not a release gate. The built-in Speaker CRM is supported scope and must be included in the organizer evidence. A waiver is not a pass; fix and re-run the affected gate.

## Release evidence header

Create an operator-owned record outside the repository containing:

- Candidate version, commit SHA, clean/dirty result, UTC start time, release owner, and rollback owner.
- Local, staging, and production web/API origins, plus the observed `workers_dev` state.
- Cloudflare Worker deployment/version IDs and D1/R2/Queue names/IDs (never tokens).
- When Airtable is enabled, its base labels/IDs and data classification (never
  tokens).
- OpenSend URL, sender verification state, staging suppression/allowlist state, delivery IDs, and redacted message headers.
- Evaluator seed/repair manifest version and synthetic identity keys (never passwords or inbox contents).
- Local Playwright/axe report paths explicitly labeled local.
- Staging Ever session IDs, staging `codex-cua` target/app state, and redacted screenshots explicitly labeled staging.
- Real D1, R2, Queue, OpenSend, webhook, and calendar observations, plus Airtable
  observations only when the adapter is enabled and composed; distinguish every
  boundary from unit fakes.
- Preflight JSON, migration compatibility/backup evidence, deployment log
  references, rollback plan, sanitized Forge/GitHub visibility observations, and
  final go/no-go approvals.

## 1. Candidate and repository integrity

From a clean checkout of the candidate, record:

```bash
git status --short
git rev-parse HEAD
git remote -v
git log --oneline --decorate -n 20
sf repo get jaeyunha/open-sessionboard
```

Accept only when the candidate status is clean, the intended Forge and GitHub
mirror remotes are present, both mirrors point to the approved candidate, the
license is Elastic License 2.0, and no `.env`, Wrangler state, secrets, test
results, browser profile, recording, or generated build is tracked. Repository
publication is governed independently by
[`public-release.md`](public-release.md).

## 2. Automated and local browser evidence

Install from the lockfile and run the repository's automated gate on the candidate:

```bash
bun install --frozen-lockfile
make build
make all
```

The automated Playwright/axe artifacts from this command are local or CI evidence. Label them with the local loopback target (`http://127.0.0.1:3015` and `http://127.0.0.1:8787`) and do not present them as staging evidence. Do not suppress warnings, skip authentication, weaken assertions, or convert a timeout into a pass.

When OpenAI is the candidate provider, also run the opt-in synthetic real-API adapter and local agenda lifecycle checks from `docs/setup.md`. They validate the key/provider path without printing secrets, but remain local diagnostics rather than staging evidence.

## 3. Read-only preflight and migration review

Drizzle Kit generates and checks schema history; Wrangler applies numbered D1 SQL
migrations and owns `d1_migrations`. Capture the pre-migration recovery point and run a
foreign-key check before Worker deployment.

Airtable is optional. Releases enabling the adapter verify an isolated staging
connection separately; Airtable availability is never required for ordinary traffic and
never provides fallback reads after D1 cutover.

Run the read-only release preflight without an optional-provider requirement:

```bash
node scripts/release/preflight.mjs \
  --environment staging \
  --env local=.env.release-local \
  --env staging=.env.release-staging \
  --env production=.env.release-production \
  --offline
```

Repeat online with `CLOUDFLARE_API_AUDIT_TOKEN` and `FORGE_API_TOKEN` from the
secret manager and no `--offline`. The preflight must confirm each selected
environment's consistent web/API/auth origin contract, real D1 IDs,
environment-suffixed R2/Queue resources, isolated OpenSend credentials,
account-restricted token policy, migration readiness, and exact Forge repository
identity. When Airtable is selected, also verify its isolated credentials and
resource boundary. The preflight accepts private or public mirror visibility and
does not deploy or seed.

Inspect D1 migrations before any mutation. Retain the compatibility analysis, a usable backup/time-travel recovery point, migration output, and a named recovery owner. A dry run or preflight cannot prove that a migrated schema is compatible with the currently deployed Worker.

Optional remote Drizzle inspection uses the same operator-owned
`CLOUDFLARE_ACCOUNT_ID`, `D1_DATABASE_ID`, and `CLOUDFLARE_API_TOKEN` values as
the deployment environment. `D1_DATABASE_ID` is the single D1 database ID
variable; do not introduce a separate Drizzle-only alias. Drizzle inspection
does not replace the Wrangler-owned numbered migration path.

### Legacy review-plan lineage repair

Migrations `0035_review_plan_revision_lineage.sql`,
`0036_review_plan_lineage_repairs.sql`, and
`0037_review_plan_lineage_repair_triggers.sql` record plausible repair
candidates but do not infer predecessor relationships from legacy
user-controlled IDs. The candidate predicate rejects independent roots whose
IDs merely contain `-revision-` while preserving the old 100-character
truncation format. Migration `0037` installs the same final predicate as
durable insert triggers so revisions written by the old Worker during
migration/deployment overlap are still recorded.
Migration `0038_review_plan_revision_sync_lock.sql` adds the internal
family-synchronization lock used by the candidate Worker, and migration
`0039_review_plan_revision_sync_token.sql` adds its resumable owner token.
Apply all five migrations before deploying that Worker. After applying them to
an environment that already contains review-plan revisions:

Every review-plan open, close, or schedule request must include a caller-owned
UUID in `revisionSyncToken`. Keep that token until the request and any required
family reconciliation succeed; reuse it after a transport interruption. The
authoritative tip retains the completed operation's token with its pending bit
cleared, so retrying a successfully committed single-batch operation after a
lost response returns the completed result instead of taking a new lock.

1. After the new Worker is deployed and old in-flight requests have drained,
   query `review_plan_lineage_repairs_required` and retain the result with the
   migration evidence.
2. For each row, use organizer change history and the exact plan/round records
   to identify the predecessor. Set `review_plans.predecessor_plan_id` and
   `review_rounds.predecessor_round_id` explicitly. Never approve a mapping
   from a matching `-revision-` suffix alone.
3. Keep one direct successor per plan. If a legacy draft was intentionally
   abandoned or is an independent root, record that operator decision before
   deleting its repair row without a predecessor mapping.
4. Delete only repair rows that have an explicit mapping or a documented
   independent-root decision.
5. Call
   `POST /api/admin/evaluations/plans/:planId/reconcile-revision-family` for the
   authoritative tip with its `expectedVersion` and a newly generated UUID in
   `revisionSyncToken`. Reuse that same token if the request must be retried.
   This works for already-closed and past-due tips without reopening them. Then
   verify the retained reviewer assignment, draft review, open/closed state,
   and round opening/closing instants through the reviewer workspace.

Do not declare the migration complete while
`review_plan_lineage_repairs_required` contains an unresolved row.

If an operator reconciliation process exits after taking the lock, retry the
endpoint with the same `revisionSyncToken`; a different token is rejected. If
the original token is irretrievably lost, drain or stop the affected Worker,
verify that no reconciliation request remains active, clear that one
authoritative tip's pending bit and token in D1, restart the Worker, and invoke
the endpoint with a new UUID. The pending lock blocks reviewer writes and
successor creation until the family is reconciled.

### Legacy Airtable business-data cutover

Deploying a D1-authoritative Worker does not migrate historical Airtable
records by itself. Before switching an environment that previously used
Airtable as business storage:

1. Record a D1 Time Travel bookmark with `wrangler d1 time-travel info`.
2. Export Airtable in strict mode. If legacy peripheral rows lack stable
   `Application ID` values, rerun with `--quarantine-report`; this exports only
   the valid remainder and writes a redacted report.
3. Generate a domain-transformed import plan. Do not copy raw Airtable field
   names directly to D1: JSON-backed submissions, speakers, agendas,
   evaluations, and CRM aggregates require normalized child rows.
4. Rehearse the exact plan against a fresh local D1 with migrations `0001`
   through `0013`, then run `PRAGMA foreign_key_check`.
5. Apply the same validated plan remotely with explicit `--apply`. The
   importer is dry-run by default and rejects plans containing quarantined
   rows.
6. Run the missing-Agenda backfill, compare canonical counts and hashes, and
   exercise the deployed organizer/public workflows before declaring cutover.

Do not use `wrangler d1 export` as an incidental live-release backup:
Cloudflare warns that it can make the database temporarily unavailable. Time
Travel is the no-downtime recovery mechanism for this cutover.

### Event-role invitation migration preflight

Before applying `0027_event_role_invitations.sql` to staging or production:

1. Create a D1 backup or confirm the account's Time Travel recovery point and
   record the operator responsible for rollback.
2. Count active speaker grants that are eligible for invitation backfill:
   - the account is verified;
   - the participant identity is resolved;
   - participant, active speaker profile, and current account emails agree;
   - the participant belongs to the same organization and event as the grant.
3. Count and review active speaker grants excluded by those predicates. The
   migration skips incompatible invitation backfill rather than aborting, then
   fail-closes those unmatched grants and clears speaker claims without an
   exact accepted invitation. The organizer owns remediation and re-invitation
   for every excluded row.
4. Count reviewer invitation candidates from existing reviewer memberships,
   reviewer-pool grants, and review assignments, grouped by organization/event:
   - count verified eligible accounts separately from unverified or unresolved
     accounts excluded from backfill;
   - confirm every existing reviewer-pool member resolves to a pool with a
     non-null `updated_at`; migration `0027` uses that value to initialize the
     durable reviewer grant generation;
   - assign organizer ownership for account verification and re-invitation of
     every excluded reviewer before relying on event access.
5. Apply the remote migration and retain its complete output. Then run
   `PRAGMA foreign_key_check`, confirm no reviewer-pool member has a null
   `granted_at`, confirm no active participant grant lacks an exact accepted
   speaker invitation and active profile, and compare inserted
   reviewer/speaker invitation counts with the preflight counts.
6. Verify in staging with real accounts:
   - late account verification produces a pending `/work` invitation;
   - accept, decline, and revocation each enforce exact event scope;
   - accepted reviewer and speaker access survives a later verified email
     change for the same account ID;
   - assignments, participant records, profiles, sessions, and tasks remain
     unchanged through acceptance and revocation.

## 4. Staging deployment and acceptance

After preflight and migration approval, deploy the API Worker with the guarded script:

```bash
node scripts/cloudflare/deploy.mjs staging open-sessionboard:staging
```

The command requires `CLOUDFLARE_API_TOKEN`, validates the deployment
configuration, applies remote D1 migrations, and deploys the Worker. If migration
succeeds while deployment fails, stop the product release, leave repository
visibility unchanged, and execute the recorded recovery path before retrying.

Set `AI_PROVIDER=disabled` or `AI_PROVIDER=openai`. OpenAI is optional only
when disabled, and `OPENAI_API_KEY` is required when `AI_PROVIDER=openai`.
AI remains optional at application boot when disabled. Before deploying with
OpenAI enabled, confirm that the target environment has its own
`OPENAI_API_KEY` Cloudflare secret. Never place it in Wrangler `[vars]`,
`NEXT_PUBLIC_*`, CI output, or evidence.

Deploy the web Worker from the identical candidate commit. The script requires the exact browser-visible `NEXT_PUBLIC_APP_URL` and server-only `API_UPSTREAM_ORIGIN`. Organization scope comes from authenticated memberships and organization-qualified routes:

```bash
set -eu
: "${NEXT_PUBLIC_APP_URL:?set the staging web origin from the operator-owned environment file}"
: "${API_UPSTREAM_ORIGIN:?set the staging API upstream origin from the operator-owned environment file}"
: "${CLOUDFLARE_API_TOKEN:?set the staging deployment token from the secret manager}"
node scripts/cloudflare/deploy-web.mjs staging open-sessionboard-web:staging
```

For non-local deployment, the script validates the supplied server-only
`API_UPSTREAM_ORIGIN` as an HTTPS origin and configures the web server-side
proxy. Browsers always call same-origin `/api/*` through the browser-visible
`NEXT_PUBLIC_APP_URL`. Verify that `/api/*` same-origin requests, API CORS,
auth cookies, and callbacks all use the observed configured origins.

Verify the exact staging origins before browser work:

```bash
curl --fail "$NEXT_PUBLIC_APP_URL/health"
curl --fail "$API_UPSTREAM_ORIGIN/api/health"
curl --fail "$API_UPSTREAM_ORIGIN/api/v1/openapi.json"
```

Then run the seeded workflow from [Browser QA](qa-runbook.md) against the real rendered staging build:

1. CFP configuration, conditional fields, account verification, draft resume, participant add, submit, and retry.
2. Speaker portal ownership, profile, tasks, files/forms, and acceptance-gated content.
3. Multi-round human review, blind fields, real-provider advisory evaluation suggestions, human confirmation/edit, decision, communication, and reports.
4. Built-in CRM contact/import/filter/tag/custom-field/history/duplicate/merge behavior.
5. Agenda conflict checks, real-provider private proposals with selective human application/rejection and stale handling, warning override, immutable publication, rollback, embeds, JSON/iCal, API keys, and signed/retrying webhooks.
6. OpenSend status plus one real controlled calendar request/update/cancel sequence.
7. Keyboard, screen-reader, CUA focus/spatial checks, narrow/wide layouts, loading/empty/error/forbidden/retry states.
8. Selected-field content remix through the real provider, human edit/apply/reject, reload/audit, stale rejection, and proof that unselected fields and unapplied output never alter source data.

Ever and `codex-cua` must use synthetic identities and the deployed staging
origin. Local Playwright results cannot substitute for these sessions. Evidence
must show the real isolated D1/R2/Queue/OpenSend/webhook boundaries, not mocked
routes. When Airtable is disabled or not composed, prove that state and its
non-dependency; require real Airtable boundary evidence only when the adapter is
enabled in the exported runtime.

Also disable or misconfigure the selected AI provider and prove the rest of the application still works while AI controls/endpoints return an explicit unavailable state. Provider configuration and mocked tests are not AI feature acceptance.

## 5. Security, privacy, performance, and known gaps

Before production, inspect staging evidence for cross-tenant and cross-user
denials, sanitized rich text, private non-cacheable assets, scoped API keys,
webhook replay/deduplication, publication locks, immutable public projections,
and D1 authority boundaries. Exercise and record request errors, Queue/outbox
lag, OpenSend bounces/complaints, webhook delivery, and calendar failure signals
with alert ownership. Add Airtable authority, retry, and rate-limit evidence only
when the adapter is enabled and composed in the candidate.

Use reproducible reports for the governing budgets:

| Budget | Target |
| --- | --- |
| Public LCP | ≤ 1.5 s at p75 |
| INP | ≤ 200 ms |
| CLS | ≤ 0.1 |
| Cached API reads | ≤ 300 ms at p95 |
| Ordinary API writes | ≤ 1 s at p95 |
| Airtable-backed workflows | ≤ 2 s at p95 |

Event-timezone changes still lack a complete draft
migration/revalidation/new-publication flow. DST-specific resolver failures do
have stable API error mapping in source and local tests, but no deployed or
staging observation has been recorded. Keep the timezone-migration limitation
visible and do not present local DST checks as release evidence.

## 6. Production deployment and bounded smoke

Production requires a recorded go approval after staging, security, accessibility, performance, migration, rollback, and real-provider evidence are complete. Deploy the API from the identical candidate:

```bash
node scripts/cloudflare/deploy.mjs production open-sessionboard:production
```

Deploy the web Worker with the production-only browser-visible app URL, server-only API upstream origin, and matching confirmation token:

```bash
set -eu
export NEXT_PUBLIC_APP_URL='https://your-production-web.example.com'
: "${API_UPSTREAM_ORIGIN:?set the production API upstream origin from the operator-owned environment file}"
: "${CLOUDFLARE_API_TOKEN:?set the production deployment token from the secret manager}"
node scripts/cloudflare/deploy-web.mjs production open-sessionboard-web:production
```

Do not call an environment deployed or verified until its configured origins
serve the expected candidate Worker and web build. Perform only bounded
production smoke with dedicated demo fixtures:

- health, trace/request headers, cache policy, and exact-origin CORS;
- email-link path to a designated demo account using controlled delivery;
- organizer, reviewer, and speaker role landing pages;
- one read-only published speaker/agenda embed at narrow and wide viewport;
- one scoped read-only API-key call;
- one controlled webhook test delivery and redacted status view;
- production OpenSend/calendar status with no real participant broadcast.

Do not replay the full staging dataset into production or mutate a live agenda
as a smoke test. Repository visibility does not change the required production
safety boundary.

## 6a. Evaluator manual evidence and finalization gate

The evaluator model configuration is frozen to **Terra medium (agent)** and
**Sol high (judge)**. Do not substitute, tune, or recommend a model change.
Provider configuration, local synthetic AI checks, and mocked responses are
not release evidence.

The release owner must use the candidate run's generated pending queue rather
than copying IDs or counts from an earlier run. Historical run-specific maps
remain in [`llm-judge-runs.md`](llm-judge-runs.md). Preserve:

```text
<run-dir>/manual-checklist.md
<run-dir>/manual-results.json
<run-dir>/manual/<CHECK-ID>/...
<run-dir>/report.json
<run-dir>/report.html
<run-dir>/run.log
```

Each `manual-results.json` key must be one pending rubric ID for that run, exactly once,
with a parser-compatible `verdict` and `notes`. For release evidence, `notes`
must contain the concrete expected/observed result, named reviewer and role,
UTC ISO-8601 `reviewed_at`, exact observed boundary, limitations, and one or
more relative redacted `evidence_refs` under `manual/<CHECK-ID>/`. Do not put
credentials, magic links, raw inbox contents, API keys, or private payloads in
the run directory.

Allowed manual outcomes are:

| Outcome | Meaning | Release result |
| --- | --- | --- |
| `pass` | Full criterion observed at the required boundary with cited artifacts. | Required for every release row. |
| `partial` | A material half or boundary remains unverified. | Visible limitation; no-go. |
| `fail` | Attempted behavior is broken. | No-go. |
| `not_found` | The applicable surface was searched and the capability is absent. | No-go. |
| `cannot_judge` | Evidence is insufficient or the workflow was blocked. | Leave pending; no-go. |

Before invoking the finalizer, compare the source `manual-results.json` key set
with the generated pending IDs using a duplicate-detecting parser. Reject
missing, unknown, duplicate, placeholder, invalid, missing-evidence, or
non-passing required records.

From the evaluator checkout, run the actual fold-in command:

```bash
pnpm run finalize -- --run <run-dir>
```

The current command consumes recognized pending keys, updates the matching
`report.json` item, regenerates `report.html`, and rewrites the checklist. It
warns/ignores unknown or non-pending keys, leaves missing/invalid/placeholder/
`cannot_judge` entries pending, and does not itself reject duplicate keys or
non-passing outcomes. Treat its exit status and warnings as processing output,
not approval. Release acceptance additionally requires:

1. `manual-results.json` contains every generated pending ID once each.
2. Every pending outcome is `pass`, with artifacts present, redacted, and tied
   to the same candidate SHA/environment; no limitations are hidden.
3. `<run-dir>/report.json` shows `manualPending: 0` and `scoreWithheld: false`;
   `<run-dir>/report.html` and the evidence header agree.
4. Automated/local checks, provider/deployed observations, manual evidence, and
   LLM-judge output remain labeled as separate evidence classes.

No current documentation change performs these observations. Until a release
owner completes the candidate run's queue, it cannot support a release or
submission claim.

## 7. Final release gate

Check every item against the same production candidate:
- [ ] Manual evidence gate passed against the candidate run's exact generated pending IDs: no missing, unknown, duplicate, placeholder, invalid, missing-evidence, or non-passing records.
- [ ] The evaluator finalizer was run from its checkout with `pnpm run finalize -- --run <run-dir>`; `report.json` has `manualPending: 0` and `scoreWithheld: false`, and the generated HTML/checklist agree.
- [ ] Any manual limitation (`partial`, `fail`, `not_found`, `cannot_judge`), known implementation gap, or unavailable provider remains visible and is a no-go.
- [ ] Manual, automated/local, provider/deployed, and LLM-judge evidence are labeled separately; mocked/local diagnostics and provider configuration are not release evidence.
- [ ] Candidate SHA is clean and all evidence paths identify that SHA.
- [ ] Staging/production web and API origins match their ignored environment files and observed Worker state.
- [ ] The selected web and API origins match operator-owned environment files and observed Worker state. `https://eventloom.namuh.co` may be recorded only as the current hosted example, never as a self-hosting requirement.
- [ ] Automated local/CI checks and local Playwright/axe evidence passed without skipped or softened assertions.
- [ ] Read-only preflight and migration compatibility/recovery review passed.
- [ ] API and web deployments, health checks, CORS, cookies, and same-origin proxy behavior were observed.
- [ ] Staging Ever and `codex-cua` evidence passed on the candidate with synthetic identities.
- [ ] Real D1, R2, Queue, OpenSend, webhook, and calendar boundary evidence is
      attached separately from local fakes; Airtable is either proven disabled
      and non-authoritative or, when enabled and composed, covered by real
      boundary evidence.
- [ ] CFP, portal, review, human decision, CRM, agenda/publication, embeds/API, security, accessibility, and performance scenarios passed.
- [ ] Real-provider staging evidence covers agenda, evaluation, and remix proposals; provenance, human apply/edit/reject, reload/audit, stale handling, unavailable behavior, and no automatic consequential action are proven.
- [ ] Calendar request/update/cancel evidence shows one stable UID and no duplicate event.
- [ ] The timezone-migration gap is recorded; DST-specific API error mapping is
      verified in staging rather than inferred from local tests.
- [ ] Rollback and monitoring owners are active; secrets and private artifacts are absent.
- [ ] Demo accounts, license, evaluator walkthrough, screenshots/video, and competition fields are final and redacted.

Any unchecked item is a product-release no-go. Repository visibility remains
governed independently by [`public-release.md`](public-release.md).

## 8. Repository publication status

Source-repository publication may occur before a deployed product release. This
runbook never treats public visibility as feature, provider, staging, or
production evidence.

1. Record the current Forge and GitHub visibility using sanitized
   host/owner/repository/state output; never retain credential-bearing remote
   URLs.
2. Confirm both mirrors expose the approved source commit and intended reachable
   history. If a required mirror is still private, complete
   [`public-release.md`](public-release.md) before changing it.
3. Verify public mirrors as an unauthenticated reader and record the observed
   URL, commit, operator, and UTC time.
4. Bind release and competition copy to the observed public repository URL and
   exact candidate commit without implying that source visibility proves the
   hosted deployment.

A visibility verification failure blocks public-repository and competition
submission evidence; it does not by itself redefine deployed product behavior.
If a private artifact or credential is exposed, return affected mirrors to
private, rotate the credential, remove the exposure at its source, and repeat
the publication checklist on a new candidate.

## 9. Competition submission checklist

- [ ] Product name and one-sentence program-workflow value proposition.
- [ ] Production web URL and health-checked API origin from the observed pinned deployment.
- [ ] Public repository URL(s) and Elastic License 2.0 license.
- [ ] Demo organizer, reviewer, and speaker accounts/instructions delivered through a secure channel.
- [ ] Evaluator walkthrough follows CFP → portal → review → CRM → agenda → publication → embeds/API.
- [ ] OpenAPI link points to the verified production runtime document.
- [ ] Screenshots/video are from the release commit and contain no private data or secrets.
- [ ] Cloudflare, Forge, OpenSend, API, enabled integrations, accessibility,
      security, and performance evidence is included without unsupported claims.
- [ ] Known limitations match the current contract, including operator-supplied deployment origins and calendar implementation gaps.
- [ ] Submission title, description, URLs, credentials, category, contact fields, deadline, and timezone were reviewed by a second person.
- [ ] Portal confirmation/receipt and UTC submission time are retained.

After submission, monitor request errors, Queue/outbox lag, webhook delivery,
OpenSend bounces/complaints, calendar failure state, and Airtable retries only
when that adapter is enabled. Post-submission monitoring does not replace the
pre-release gate.
