# Release and competition submission runbook

This is an operator-controlled gate. Documentation, source coverage, a passing preflight, or a local test run does not mean Eventloom is deployed, public, or submitted. Every claim must be tied to one clean candidate commit, one environment, and an observable artifact.

The governing specification lists the competition deadline as **Wednesday, August 12, 2026 at 10:00 PM Pacific Time**. Recheck the organizer's current portal deadline, timezone, and required fields before submission; do not rely on a local clock assumption.

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

Accept only when the candidate status is clean, the intended Forge and GitHub
mirror remotes are present, both mirrors point to the approved candidate, the
license is Elastic License 2.0, and no `.env`, Wrangler state, secrets, test
results, browser profile, recording, or generated build is tracked. Visibility
changes remain explicit owner actions after this gate.

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
environment-suffixed R2/Queue resources, isolated Airtable/OpenSend
credentials, account-restricted token policy, migration readiness, and exact
Forge repository identity. It accepts private or public mirror visibility and
does not deploy or seed.

Inspect D1 migrations before any mutation. Retain the compatibility analysis, a usable backup/time-travel recovery point, migration output, and a named recovery owner. A dry run or preflight cannot prove that a migrated schema is compatible with the currently deployed Worker.

Optional remote Drizzle inspection uses the same operator-owned
`CLOUDFLARE_ACCOUNT_ID`, `D1_DATABASE_ID`, and `CLOUDFLARE_API_TOKEN` values as
the deployment environment. `D1_DATABASE_ID` is the single D1 database ID
variable; do not introduce a separate Drizzle-only alias. Drizzle inspection
does not replace the Wrangler-owned numbered migration path.

## 4. Staging deployment and acceptance

After preflight and migration approval, deploy the API Worker with the guarded script:

```bash
node scripts/cloudflare/deploy.mjs staging open-sessionboard:staging
```

The command requires `CLOUDFLARE_API_TOKEN`, validates the deployment configuration, applies remote D1 migrations, and deploys the Worker. If migration succeeds while deployment fails, stop, keep the mirrors private, and execute the recorded recovery path before retrying.

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

Ever and `codex-cua` must use synthetic identities and the deployed staging origin. Local Playwright results cannot substitute for these sessions. Evidence must show the real isolated Airtable/D1/R2/Queue/OpenSend/webhook boundaries, not mocked routes.

Also disable or misconfigure the selected AI provider and prove the rest of the application still works while AI controls/endpoints return an explicit unavailable state. Provider configuration and mocked tests are not AI feature acceptance.

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

Do not replay the full staging dataset into production or mutate a live agenda as a smoke test. Keep both mirrors private until the final visibility gate.

## 6a. Evaluator manual evidence and finalization gate

The evaluator model configuration is frozen to **Terra medium (agent)** and
**Sol high (judge)**. Do not substitute, tune, or recommend a model change.
Provider configuration, local synthetic AI checks, and mocked responses are
not release evidence.

The 41-row map in
[`llm-judge-runs.md`](llm-judge-runs.md#exact-id-to-artifact-to-report-map)
freezes the pending queue from run `2026-08-11T14-11-08`: 6 Abstract
Management, 4 AI Agenda, 12 CFP, 8 Content Management, 3 Public Widgets, 3
Speaker CRM, and 5 Speaker Management IDs. Because `cannot_judge` automated
items also enter the pending queue, later runs can have a different set. The
release owner must use the candidate run's generated queue and preserve:

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

Before invoking the finalizer, the release owner must compare the parsed
`manual-results.json` key set with the run's generated pending IDs and reject
missing, unknown, duplicate, placeholder, invalid, missing-evidence, or
non-passing required records. For run `2026-08-11T14-11-08`, that set is the
exact 41 IDs mapped above. A duplicate JSON object key is not safely detectable
after a normal parse, so validate the source or use a duplicate-detecting
parser.

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

1. `manual-results.json` contains every generated pending ID once each (the
   mapped 41 IDs for run `2026-08-11T14-11-08`).
2. Every pending outcome is `pass`, with artifacts present, redacted, and tied
   to the same candidate SHA/environment; no limitations are hidden.
3. `<run-dir>/report.json` shows `manualPending: 0` and `scoreWithheld: false`;
   `<run-dir>/report.html` and the evidence header agree.
4. Automated/local checks, provider/deployed observations, manual evidence, and
   LLM-judge output remain labeled as separate evidence classes.

No current documentation change performs these observations. Until a release
owner completes them, the run is incomplete and cannot support a release or
submission claim.

## 7. Final release gate

Check every item against the same production candidate:
- [ ] Manual evidence gate passed against the candidate run's exact generated pending IDs (the mapped 41-ID set for `2026-08-11T14-11-08`): no missing, unknown, duplicate, placeholder, invalid, missing-evidence, or non-passing records.
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
- [ ] Real Airtable, D1, R2, Queue, OpenSend, webhook, and calendar boundary evidence is attached separately from local fakes.
- [ ] CFP, portal, review, human decision, CRM, agenda/publication, embeds/API, security, accessibility, and performance scenarios passed.
- [ ] Real-provider staging evidence covers agenda, evaluation, and remix proposals; provenance, human apply/edit/reject, reload/audit, stale handling, unavailable behavior, and no automatic consequential action are proven.
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
5. Confirm unauthenticated readers can see only the intended repository, README, source, and Elastic License 2.0 license, with no secrets or private artifacts.

If visibility cannot be verified, treat the product as unreleased. If a private artifact or credential is exposed, stop submission, return affected mirrors to private, rotate the credential, remove the exposure at its source, and repeat the gate on a new candidate.

## 9. Competition submission checklist

- [ ] Product name and one-sentence program-workflow value proposition.
- [ ] Production web URL and health-checked API origin from the observed pinned deployment.
- [ ] Public repository URL(s) and Elastic License 2.0 license.
- [ ] Demo organizer, reviewer, and speaker accounts/instructions delivered through a secure channel.
- [ ] Evaluator walkthrough follows CFP → portal → review → CRM → agenda → publication → embeds/API.
- [ ] OpenAPI link points to the verified production runtime document.
- [ ] Screenshots/video are from the release commit and contain no private data or secrets.
- [ ] Cloudflare, Airtable, Forge, OpenSend, API, accessibility, security, and performance evidence is included without unsupported claims.
- [ ] Known limitations match the current contract, including operator-supplied deployment origins and calendar implementation gaps.
- [ ] Submission title, description, URLs, credentials, category, contact fields, deadline, and timezone were reviewed by a second person.
- [ ] Portal confirmation/receipt and UTC submission time are retained.

After submission, monitor request errors, Queue/outbox lag, webhook delivery, Airtable retries, OpenSend bounces/complaints, and calendar failure state. Post-submission monitoring does not replace the pre-release gate.
