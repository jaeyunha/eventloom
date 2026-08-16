# Browser interaction and accessibility QA

This runbook defines evidence collection; it does not claim that any QA pass has occurred. A release-quality result needs a clean candidate SHA, a dated evidence directory, and observable assertions against the intended environment. Local Playwright, staging Ever, staging `codex-cua`, and real Airtable/OpenSend observations are separate evidence classes.

## Evidence classes and current origins

For D1 authority and the optional Airtable adapter, deployed acceptance records the
candidate SHA, API/web origins, D1 database, Queue, and isolated Airtable base. Exercise
Worker boot without Airtable variables, D1 CRUD/migrations, OAuth or PAT connection,
projection and replay, pause/resume/disconnect, webhook MAC success/failure, an
allowlisted inbound edit, a version conflict, explicit resolution, and the matching UI.
Local and mocked evidence is diagnostic and is not deployed provider evidence.

- **Local Playwright:** run against the local services at `http://127.0.0.1:3015` and `http://127.0.0.1:8787`. It is useful automated evidence for the local build only. It cannot prove staging deployment, real provider delivery, or release acceptance.
- **Staging Ever and `codex-cua`:** run against the deployed staging web and
  API origins from the ignored staging environment file. Use the real rendered
  build, real Airtable staging data, the deployed API, and the configured
  OpenSend boundary. Do not replace these with mocked routes or a local build.
- **Production smoke:** use only designated synthetic/demo records after the production deployment gate. Do not replay the complete staging dataset or use participant data.

The browser-visible staging API base is the web origin: `/api/*` is proxied by the web Worker to `API_UPSTREAM_ORIGIN`, the pinned API Worker origin. Record both origins in every staging result.

## Preconditions

1. Use local or isolated staging only. Keep production participant data out of fixtures, inboxes, recordings, screenshots, and logs.
2. Provision an explicit synthetic organization/event and distinct synthetic identities for organizer, reviewer, speaker, submitter, and any named evaluator personas. The canonical evaluator scope, when used, is organization `ai-engineer` and event `devflow-conf-2027`; the commands and confirmation boundaries are in [setup](setup.md).
3. Use the built-in Speaker CRM in the supported organizer walkthrough. External event-platform or third-party sign-in setup is not part of this run.
4. Use test inboxes and suppressed, sandboxed, or recipient-allowlisted OpenSend delivery. Never paste a password, magic link, API key, or private inbox content into evidence.
5. For local work, start both services with `make dev` and check both health endpoints. For staging work, check the exact pinned web and API health endpoints after deployment.
6. Record before browser interaction: commit SHA and dirty/clean state, `APP_ENV`, exact origins, evaluator fixture/manifest version, browser and viewport, tool/session ID, operator, and UTC start time.
7. Store redacted screenshots, accessibility trees, traces, and reports outside the repository, for example `/tmp/eventloom-qa/<commit>-<utc-run>`. Do not commit browser profiles, recordings, or generated output.

## Local automated pass

The local Playwright command is a local/CI gate, not staging evidence:

```bash
make test-e2e
```

Keep its report tied to the local `127.0.0.1` origins and candidate SHA. A deterministic fake or mocked response can support a unit/automated test, but it cannot establish a real Airtable, D1, Durable Object, R2, Queue, OpenSend, or deployed Worker result.

## Required walkthrough

Exercise every state with visible assertions, not just successful navigation. Use the same authenticated synthetic identities throughout a stateful staging walkthrough.

### CFP and account

- Open the public CFP welcome state and verify the event/timezone display.
- Complete email/password and verified-email or magic-link fixture access; do not skip authentication.
- Use keyboard-only navigation through Welcome → Account → Submission → Participant → Review.
- Trigger required-field errors and confirm focus, labels, descriptions, and announcements.
- Show/hide a conditional field and prove its value and requiredness follow the rule.
- Save, reload, and resume a draft; add a second participant and secondary contact.
- Submit once, retry the final action, and prove only one submitted version exists.
- Confirm success content and portal redirect.

### Speaker portal and deliverables

- Confirm each speaker sees only authorized submissions, profiles, tasks, files, forms, and downloads.
- Edit biography/profile fields and upload a private asset through the authorized flow.
- Exercise task dependency feedback, blocked and valid transitions, due-state presentation, and a completed deliverable.
- Verify acceptance-gated content is absent for an unaccepted fixture.
- Attempt a cross-user or cross-event URL and capture a safe denial with no private data.
- Confirm private responses are not browser-cacheable and signed asset links expire.

### Organizer, reviewer, and CRM

- Configure event/CFP settings and preview conditional routing.
- Filter and sort submissions, open a detail view without losing context, and verify organization/event scope.
- Assign a multi-round review plan and complete a rubric with autosave, comments, keyboard controls, and conflict-of-interest abstention.
- Verify blind-review fields remain hidden and that only a human can make the final decision; advisory AI remains uncounted until human confirmation/edit.
- Create or import synthetic CRM contacts, search/filter, apply tags/custom fields and pipeline state, add a note/program-history item, detect a duplicate, and perform an explicit optimistic-concurrency merge.
- Confirm CRM records never authorize another organization, private speaker files, reviewer notes, or unpublished agenda data.

### Advisory AI

AI is not fixture generation. Seed normal synthetic records first, then invoke a proposal as an authorized user. Mocked provider tests prove validation and failure handling only.

For an OpenAI-backed local diagnostic, keep `OPENAI_API_KEY` only in the ignored root `.env`, set `AI_PROVIDER=openai`, and run the opt-in synthetic adapter plus local agenda lifecycle tests documented in `docs/setup.md`. Never capture the key, authorization header, raw private prompt, or provider response.

Release evidence requires the deployed staging UI/API against the provider selected for staging:

- Request an agenda proposal and verify `openai-responses` / `gpt-5.6-sol` provenance, private diff, human-selected apply/reject, reload persistence, audit history, stale-version rejection, conflict revalidation, and no automatic publication.
- Request evaluation assistance and verify `gpt-5.6-sol` provenance using only the reviewer-visible rubric/submission projection; suggestions remain uncounted until a human confirms or edits them and cannot decide an outcome.
- Request content remix and verify `gpt-5.6-terra` provenance for selected fields only; unselected fields are absent, human edits are supported, stale candidates fail, and nothing overwrites source content until explicit apply.
- Disable the provider and prove ordinary CFP, portal, review, CRM, agenda, publication, and reporting workflows still operate while AI controls/endpoints show an explicit unavailable state.

Production receives only a bounded smoke check after the complete staging workflow passes.

### Agenda, publication, and embeds

- Open list/day/week/month/room views and retain the event's canonical IANA timezone.
- Drag an accepted session into a room/time slot and provide a keyboard alternative.
- Trigger same-room and same-participant hard conflicts; prove publication remains blocked.
- Trigger a warning, enter an auditable override reason, preview the exact diff, publish one immutable revision, and prove later draft edits do not change public views.
- Verify speaker and agenda embeds in iframe and script modes, JSON/iCal projections, narrow/wide viewports, loading/empty/error states, safe theme controls, and keyboard/screen-reader navigation.
- Roll back to a prior revision and verify the new corrective revision and public projections.
- Verify one calendar invitation uses `calendar@sessionboard.namuh.co` as organizer and a UID ending in `@calendar.sessionboard.namuh.co`; verify update/cancel idempotency without duplicate delivery.

The agenda resolver and API have stable DST-specific error mapping for nonexistent and ambiguous local times. Those route errors are source-present and locally tested, but no deployed or staging observation has been recorded. Changing an event timezone still lacks a delivered full draft migration/revalidation workflow. Exercise DST cases locally or as deployment diagnostics, record the observed boundary, and never treat local tests as release evidence.

### API, webhooks, and delivery failures

- Exercise scoped public API reads, API-key scope/revocation, idempotency conflicts, and safe 400/401/403/404/409/412/429/500-style envelopes where the current fixture supports them.
- Create/rotate a webhook secret and verify that the full secret is never returned; verify a valid signature, a bad-signature rejection, retry visibility, and delivery deduplication.
- Inspect OpenSend and calendar delivery status using redacted identifiers. Verify suppressed staging mail, one updateable/cancellable calendar event, stable sequence behavior, and no duplicate retry.
- Disable or misconfigure one supported optional runtime capability and verify an actionable unavailable state without leaking configuration.

## Ever pass on staging

Check the installed tool and active sessions:

```bash
ever doctor
ever status --json
```

Use focused, durable tasks with the exact pinned staging URL, role, expected observations, and evidence directory. Example:

```bash
ever run --permission-mode guard \
  "Against the already running isolated staging app at $EVAL_WEB_ORIGIN, use the explicitly seeded synthetic organizer account already authenticated in the browser. Exercise the CFP configuration, submission, review, agenda, publication, embeds, CRM, and delivery assertions in docs/qa-runbook.md. Do not change source files or use production services. Report every assertion, failure, final URL, and redacted evidence path."
```

Use separate sessions for CFP/portal, review/CRM, agenda/publication, embeds/accessibility, and API/delivery failures. Retain each session ID, task text, observed URLs, pass/fail assertion, and redacted screenshot/state path. A narrative without browser state is not release evidence.

## `codex-cua` pass on staging

Use the `codex-cua` skill against the same rendered staging build. Confirm the bridge and select one exact browser application:

```bash
cua status
cua apps
cua start <app>
cua state --full --shot /tmp/eventloom-qa/<run>/landing.png <app>
```

After every navigation, dialog, re-rendered list, scroll, and drag/drop, re-read the accessibility state because element indexes may change:

```bash
cua click --element <index> <app>
cua type <app> 'literal synthetic text'
cua key <app> 'Tab'
cua key <app> 'Shift+Tab'
cua key <app> 'Return'
cua scroll --pages 1 <app> <element-index> down
cua drag <app> <from-x> <from-y> <to-x> <to-y>
cua state --shot /tmp/eventloom-qa/<run>/after-action.png <app>
```

The CUA evidence must cover tab order, visible focus, landmarks, Enter/Space activation, Escape dismissal and focus return, form labels/descriptions and error relationships, live announcements, dialog containment, table/list semantics, keyboard drag/drop alternatives, text zoom/reflow, contrast/non-color cues, loading/empty/validation/forbidden/conflict/failure/retry states, and exact screenshots for CFP completion, reviewer confirmation, conflict-blocked agenda, publication, CRM, and both embeds. Never type real credentials; use the approved synthetic fixture or a pre-authenticated isolated profile.

## Evidence and disposition

Create a result row for every walkthrough area:

| Field | Required value |
| --- | --- |
| Area/scenario | Exact action and state |
| Commit/environment | SHA, `APP_ENV`, web/API origins |
| Tool | Local Playwright, Ever session ID, or CUA application |
| Boundary | Local fixture, staging Airtable/OpenSend, or other observed runtime boundary |
| Evidence | Redacted screenshot/state/report path |
| Expected/observed | Concrete observable result |
| Status | Pass, fail, or blocked |
| Defect/known gap | Issue or explicit implementation gap for any non-pass |

A release QA result requires staging Ever and `codex-cua` evidence against the release commit plus real deployed-boundary observations. Local Playwright evidence remains labeled local and cannot substitute for staging browser, real Airtable/OpenSend, or manual calendar evidence. Never mark a stale commit, mocked provider response, skipped-auth walkthrough, or known timezone/DST gap as a pass.

For an Airtable-to-D1 cutover, the evidence bundle must additionally include:

- the Airtable inventory schema hash and per-table importable/quarantined
  counts;
- the D1 Time Travel bookmark captured before the first write;
- the exact transformed import-plan hash;
- local rehearsal results, including `PRAGMA foreign_key_check`;
- remote before/after counts and canonical hashes;
- the missing-Agenda invariant for every imported Event;
- confirmation that no quarantined record was written; and
- live acceptance with Airtable unavailable, proving it remains an optional
  adapter rather than a business-read fallback.

## Frozen evaluator model and evidence boundaries

The evaluator configuration is fixed: **Terra medium** is the agent model and
**Sol high** is the judge model. Do not substitute, tune, or recommend another
model. This evaluator setting is distinct from the per-feature product advisory
configuration documented above; provider configuration alone is not feature
evidence.

Keep these evidence classes separate in every result:

- **Automated/local:** unit, integration, local Playwright/axe, deterministic
  fixtures, and mocked providers. These prove only the local/CI behavior they
  observe.
- **Provider/deployed:** a real staging or production boundary, including the
  deployed web/API Workers and isolated Airtable, D1, R2, Queue, OpenSend,
  webhook, or calendar observations. A health check or configured secret is
  not workflow evidence.
- **Manual:** a human completes the pending follow-up IDs generated for the run,
  including real-world delivery, calendar-file, export, cross-persona, and
  third-party-rendering checks, and cites redacted artifacts.
- **LLM judge:** the evaluator's automated verdict and `evidence_refs` in
  `report.json`. It is not a replacement for a manual row.

Local or mocked AI diagnostics may be useful troubleshooting, but they are
never release evidence. Timezone migration remains a known calendar limitation.
Stable DST-specific route errors are source-present and locally tested, but
remain without deployed or staging evidence.

## Evaluator manual evidence workflow

The candidate run's generated pending queue is the only valid source of manual
check IDs. Do not copy an older run's count or ID set into a new result.
Run-specific historical maps remain in
[`docs/llm-judge-runs.md`](llm-judge-runs.md). Preserve:

```text
<run-dir>/manual-checklist.md
<run-dir>/manual-results.json
<run-dir>/manual/<CHECK-ID>/...
<run-dir>/report.json
<run-dir>/report.html
<run-dir>/run.log
```

Before entering results, compare the generated pending IDs with the source
`manual-results.json` using a duplicate-detecting parser. Each record is keyed
by the rubric ID (for example, `manual-results.json["CFP-14"]`), not by a
scenario ID such as `CFP-S4`. Every record must have a non-placeholder
`verdict` and non-empty `notes` stating the reviewer/role, UTC `reviewed_at`,
observed boundary, limitations, and relative redacted `evidence_refs` under
`manual/<CHECK-ID>/`. Do not put passwords, magic links, inbox contents, API
keys, or private payloads in those artifacts.

Use only these manual outcomes:

| Outcome | Record as | QA meaning |
| --- | --- | --- |
| Pass | `pass` | Full check observed with concrete evidence. |
| Partial | `partial` | A material part remains incomplete; preserve the limitation. |
| Fail | `fail` | Attempted behavior is broken; preserve the defect and evidence. |
| Not found | `not_found` | The applicable surface was searched and the capability is absent. |
| Blocked/insufficient | `cannot_judge` | Do not finalize it; leave it pending and record why. |

The evaluator finalizer is a fold/rescore step, not a complete validator. From
the evaluator checkout, run:

```bash
pnpm run finalize -- --run <run-dir>
```

It consumes recognized pending keys from `manual-results.json`, updates
`report.json`, regenerates `report.html`, and rewrites the pending checklist.
It may warn and ignore unknown or already-finalized keys, leave
missing/invalid/placeholder/`cannot_judge` rows pending, and fail to detect
duplicate JSON object keys. QA must therefore reject missing, unknown,
duplicate, placeholder, or non-passing required rows before treating the
command as successful.

Require every pending row for the candidate run to be `pass` for release.
After finalization, `manualPending` must be zero, `scoreWithheld` false, and
every cited artifact must exist, be redacted, and match the same candidate,
environment, and UTC reviewer record.

## Manual evidence result-row checklist

For each pending row in the candidate run, retain the existing evidence-row
fields above and add:

| Field | Required value |
| --- | --- |
| Check ID | One generated pending ID, exactly once |
| Manual record | `manual-results.json["<CHECK-ID>"]` |
| Reviewer | Named human operator and role; no shared account claim |
| Reviewed at | UTC ISO-8601 timestamp after the observation |
| Boundary | Exact deployed/provider/mail/calendar boundary actually observed |
| Evidence refs | One or more relative, redacted paths under `manual/<CHECK-ID>/` |
| Notes | Concrete expected/observed result and any limitation; no inference |
| Outcome | `pass`, `partial`, `fail`, or `not_found`; `cannot_judge` remains pending |

Do not turn the generated report's `evidence_refs: ["manual"]` marker into a
claim that a screenshot, delivered message, calendar file, or external render
was observed. The row's notes and preserved manual artifacts are the evidence.
