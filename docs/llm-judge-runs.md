# LLM judge run history

This file is the historical evidence ledger for Open Sessionboard evaluator runs. It stores no credentials, magic links, API keys, browser session state, or private payloads. Evaluator artifacts remain outside the repository under `/tmp`. A ledger entry records evidence and limitations; it never upgrades source-present or partial behavior to release verification.

## Evidence and source hierarchy

The governing hierarchy is the one in [`spec/open-sessionboard.md`](../spec/open-sessionboard.md):

1. Executable code, configuration, and observed deployment define current behavior.
2. The product contract defines supported scope and status vocabulary.
3. [`ARCHITECTURE.md`](../ARCHITECTURE.md) defines system boundaries and state ownership.
4. Operational documents define executable setup, QA, deployment, and release procedures.
5. This file records evaluator evidence, run validity, and limitations.
6. Cited product evidence and focused research explain intended workflows but cannot prove release behavior.

The built-in Speaker CRM is supported first-party scope and is included in evaluator interpretation. Accelevents is a separate external event platform, outside the competition brief/evaluator requirements and unsupported by the runtime; no Accelevents run or credential is required.

## 2026-08-11 — completed automated run, manual evidence pending

- Status: incomplete diagnostic; not release evidence
- Evaluator checkout: `/tmp/killmysaas-evals-current`
- Run directory: `/tmp/killmysaas-evals-current/runs/2026-08-11T14-11-08`
- Machine-readable report: `/tmp/killmysaas-evals-current/runs/2026-08-11T14-11-08/report.json`
- Human-readable report: `/tmp/killmysaas-evals-current/runs/2026-08-11T14-11-08/report.html`
- Manual results: `/tmp/killmysaas-evals-current/runs/2026-08-11T14-11-08/manual-results.json`
- Automated result: **59.7% overall**, **72.7% coverage**, `scoreWithheld: false`
- Manual status: **41 pending**; the results file still contains generated placeholders and has not supplied accepted manual evidence
- Evaluator models: `gpt-5.6-terra` at medium effort for the agent; `gpt-5.6-sol` at high effort for the judge

All seven areas reached report generation, but the run exercised the defective pre-repair fixture: Sessions metadata was incomplete and caused the sessions list to return 500, while the agenda and speaker projections used different logical revision IDs and made combined embeds unavailable. The score therefore describes that diagnostic run, not the repaired fixture or a release candidate. No manual verdict in its placeholder `manual-results.json` is accepted, no finalized manual score is claimed, and deployed Worker version IDs and the independent release gates remain unverified.

## 2026-08-10 — previous incomplete diagnostic run

- Status: incomplete diagnostic; not release evidence
- Evaluator checkout: `/tmp/killmysaas-evals-current`
- Run directory: `/tmp/killmysaas-evals-current/runs/2026-08-10T21-35-33`
- Machine-readable report: `/tmp/killmysaas-evals-current/runs/2026-08-10T21-35-33/report.json`
- Human-readable report: `/tmp/killmysaas-evals-current/runs/2026-08-10T21-35-33/report.html`
- Execution log: `/tmp/killmysaas-evals-current/runs/2026-08-10T21-35-33/run.log`
- Manual checklist: `/tmp/killmysaas-evals-current/runs/2026-08-10T21-35-33/manual-checklist.md`

| Area | Score | Coverage |
|---|---:|---:|
| Call for Papers | 65.6% | 84.2% |
| Abstract Management | 46.4% | 100% |
| Speaker Management | 41.1% | 84.8% |
| Content Management | 32.8% | 93.5% |
| AI Agenda | 31.3% | 88.9% |
| Public Widgets | 87.1% | 100% |
| Speaker CRM | Not completed | Not completed |

The partial report records **54.0% overall** and **92.5% coverage across completed areas**. The process timed out during `CRM-S2`, so this is not a final overall result. It also ran against dirty pre-fix production workflow state. Do not use it as a release score or compare it as a complete submission result.

## 2026-08-10 — judge-provider incident

- Status: invalid as product-scoring evidence
- Run directory: `/tmp/killmysaas-evals-updated/runs/2026-08-10T13-46-51`

The judge provider returned an HTTP 520 response with Cloudflare HTML during judging. This is retained for incident diagnosis only, not as an Open Sessionboard product score. Its report may change if stored evidence is later rescored, so any future rescore must be recorded as a separate entry with the rescore time and provider status.

## 2026-08-11 — OpenAI Responses local integration diagnostic

- Status: local synthetic diagnostic; not deployed or release evidence
- Initial adapter commit: `b940452`
- Quality-model routing commit: `bab7878`
- Provider path: OpenAI Responses API using the ignored backend-only `OPENAI_API_KEY`
- Live checks: real Responses adapter; local agenda proposal lifecycle with `gpt-5.6-sol`; and typed agenda, evaluation, and remix provider contracts with Sol/Sol/Terra all passed
- Focused deterministic checks: 62 passed, 3 opt-in live checks skipped by default
- Full unit/integration gate: 640 passed, 3 opt-in live checks skipped by default
- Typecheck/lint/format: passed
- API Wrangler dry-run build and staging/production configuration validation: passed

The live checks used synthetic prompts and local seeded records. They establish that the backend key reaches the API-only adapter, strict Structured Outputs parse through all three typed feature contracts, and a real `gpt-5.6-sol` proposal passes through the local agenda suggestion lifecycle. They do not prove deployed staging UI behavior, evaluation/remix persistence, human apply/reject behavior, reload/audit behavior, or release acceptance. Separately, the evaluator agent/judge configuration is frozen to Terra medium/Sol high; this diagnostic does not authorize a model change.

## Current release status

No complete post-reset, post-deployment LLM judge run has been accepted. No area is release-verified. A release-valid evaluator run must:

1. Start from the scoped clean production workflow state for `ai-engineer / devflow-conf-2027`.
2. Complete every evaluator area in order, including the supported Speaker CRM area.
3. Finish without timeout, provider failure, or `scoreWithheld`.
4. Preserve the full scenario evidence directories and `run.log`.
5. Complete the manual checklist for real email delivery, calendar behavior, exports, and cross-persona effects that browser automation cannot verify.
6. Record the final score, coverage, run directory, deployed Worker version IDs, and manual-finalization status in a new dated section below.

A complete ledger entry is necessary evidence but does not, by itself, satisfy the product contract's full release gate. Custom web/API domains, calendar timezone-migration/error responses, and other release gates remain pending or incomplete until independently verified.

## Entry template

```text
## YYYY-MM-DD — run label

- Status: complete | incomplete | invalid
- Production web version:
- Production API version:
- Evaluator checkout:
- Run directory:
- Overall score:
- Overall coverage:
- scoreWithheld:
- Manual checklist finalized:
- Provider/model:
- Notes:
```

## 2026-08-11 run: 41-check pending ledger and finalization contract

This section is the normative bridge between the generated
`manual-checklist.md`, `manual-results.json`, and finalized report for run
`2026-08-11T14-11-08`. Its report contains exactly **41 pending IDs**: 2
`manual`, 15 `auto-partial`, and 24 otherwise automated items routed to
follow-up because the judge returned `cannot_judge`. It is not a permanent
41-item definition of every future run.

The set below freezes this run's pending ID set. A clean rerun can produce a
different queue and MUST use its newly generated checklist and results file
rather than copying this set. The current file is only a template: no human
verification is claimed. A placeholder such as
`pass | partial | fail | not_found`, an empty note, a missing artifact, or an
unperformed check is not evidence and cannot support a release claim.

### Provenance and artifact paths

- `<run-dir>/manual-checklist.md` is generated from the evaluator rubric and
  `report.json`'s pending manual queue.
- `<run-dir>/manual-results.json` is the machine-readable result object consumed
  by the evaluator finalizer. To finalize this run, it MUST contain exactly the
  41 keys in the table below, once each. A later run must use its own generated
  pending ID set.
- `<run-dir>/manual/<CHECK-ID>/...` is the redacted evidence directory
  convention. Keep screenshots, downloaded files, mail/calendar observations,
  and cross-persona captures there; do not place credentials, raw inboxes, or
  private payloads in it.
- `<run-dir>/report.json` is the machine-readable finalized score and
  limitation record. `<run-dir>/report.html` is its human-readable rendering.
  Preserve both, plus `run.log` and the scenario evidence directories.

The parser-compatible minimum for one `manual-results.json` entry is:

```json
{
  "CFP-08": {
    "verdict": "pass",
    "notes": "Reviewer: Jane Doe; reviewed_at: 2026-08-11T22:00:00Z; evidence_refs: [\"manual/CFP-08/confirmation-email.png\"]; observed: ..."
  }
}
```

`verdict` and `notes` are the only fields the current `finalize` implementation
reads. For release evidence, `notes` MUST carry a non-empty observation,
reviewer identity/role, UTC `reviewed_at`, and one or more relative
`evidence_refs` (or the same values must be retained in an accompanying
operator evidence header). Additional `reviewer`, `reviewed_at`, and
`evidence_refs` properties MAY be retained for archival, but the current
finalizer ignores them; do not mistake their presence for validation.

Allowed outcomes are intentionally narrower than judge output:

| Outcome | Meaning | Release disposition |
| --- | --- | --- |
| `pass` | The complete manual criterion is observed and supported by the cited artifact(s). | Eligible for release only after the full 41-ID gate passes. |
| `partial` | A meaningful portion is observed, but the criterion or its manual half is incomplete. | Valid score input; not passing release evidence. |
| `fail` | The attempted behavior is broken or contradicts the criterion. | Blocks release. |
| `not_found` | The operator searched the applicable surface and the capability is absent. | Blocks release. |
| `cannot_judge` | Evidence is insufficient or the workflow was blocked. | Not a valid manual result; leave pending and keep the limitation visible. |

The generated finalizer currently does **not** enforce the release gate:
`pnpm run finalize -- --run <run-dir>` reads pending IDs, accepts
`pass|partial|fail|not_found`, warns and ignores unknown/non-pending keys, and
leaves missing, placeholder, invalid, or `cannot_judge` entries pending. JSON
object parsing also cannot detect a duplicate key after it has been parsed.
When a recognized entry is applied, the finalizer updates the matching
`report.json` area item, marks its generated `evidence_refs` as `["manual"]`,
regenerates `report.html`, and rewrites the pending checklist. Therefore the
operator/release gate MUST reject missing, unknown, duplicate, placeholder, or
non-passing required checks **before** treating a successful command as release
evidence. A finalized report is release-eligible only when the exact ID set is
present, every required outcome is `pass`, `manualPending` is zero,
`scoreWithheld` is false, and every row's cited artifacts are present and
redacted. A warning, a zero exit status, or a reduced pending count is not a
substitute for those checks.

### Exact ID-to-artifact-to-report map

Each row maps one and only one canonical check to its object key, the evidence
that must be collected when the check is actually performed, and the report
slot written by `finalize`. `F` means
`pnpm run finalize -- --run <run-dir>` from the evaluator checkout. The
`report.html` anchor is the corresponding area section; it is a rendering of
`report.json`, not independent evidence.

#### Abstract Management

| ID | Manual check | `manual-results.json` record | Evidence to attach (when performed) | Finalize/report destination |
| --- | --- | --- | --- | --- |
| ABS-07 | Blind reviewer view hides identities; a second reviewer cannot see another reviewer's scores/comments. | `manual-results.json["ABS-07"]` | `manual/ABS-07/` contrasting reviewer/organizer and second-reviewer captures | F → `report.json` `areas["abstract-management"].items[id="ABS-07"]`; `report.html#abstract-management` |
| ABS-09 | Outstanding-reviewer reminder reaches the intended reviewer. | `manual-results.json["ABS-09"]` | `manual/ABS-09/` reminder action plus redacted inbox/outbound-log evidence | F → `report.json` `areas["abstract-management"].items[id="ABS-09"]`; `report.html#abstract-management` |
| ABS-10 | Aggregate scores are present and sort correctly in both directions. | `manual-results.json["ABS-10"]` | `manual/ABS-10/` descending/ascending result-table captures and observed values | F → `report.json` `areas["abstract-management"].items[id="ABS-10"]`; `report.html#abstract-management` |
| ABS-12 | Reviewer can declare conflict of interest/recusal and the resulting state is visible. | `manual-results.json["ABS-12"]` | `manual/ABS-12/` control wording plus flagged/removed queue state | F → `report.json` `areas["abstract-management"].items[id="ABS-12"]`; `report.html#abstract-management` |
| ABS-13 | Review results export opens with the expected rows and statuses. | `manual-results.json["ABS-13"]` | `manual/ABS-13/` download, filename/hash, and redacted opened-file contents | F → `report.json` `areas["abstract-management"].items[id="ABS-13"]`; `report.html#abstract-management` |
| ABS-14 | Claimed AI triage produces score/reasoning and a distinguishable human override persists. | `manual-results.json["ABS-14"]` | `manual/ABS-14/` score/rationale, human override, and reload captures (or explicit not-found search) | F → `report.json` `areas["abstract-management"].items[id="ABS-14"]`; `report.html#abstract-management` |

#### AI Agenda & Schedule Builder

| ID | Manual check | `manual-results.json` record | Evidence to attach (when performed) | Finalize/report destination |
| --- | --- | --- | --- | --- |
| AIA-02 | Newly created rooms/tracks become usable in the agenda builder. | `manual-results.json["AIA-02"]` | `manual/AIA-02/` creation forms and builder availability/assignment captures | F → `report.json` `areas["ai-agenda"].items[id="AIA-02"]`; `report.html#ai-agenda` |
| AIA-04 | Overlapping sessions for one speaker show a speaker double-booking warning. | `manual-results.json["AIA-04"]` | `manual/AIA-04/` overlap state and warning text capture | F → `report.json` `areas["ai-agenda"].items[id="AIA-04"]`; `report.html#ai-agenda` |
| AIA-05 | Same-room overlap is blocked or visibly flagged. | `manual-results.json["AIA-05"]` | `manual/AIA-05/` rejected placement or room-conflict warning | F → `report.json` `areas["ai-agenda"].items[id="AIA-05"]`; `report.html#ai-agenda` |
| AIA-06 | Moving a session clears conflicts and persists after reload. | `manual-results.json["AIA-06"]` | `manual/AIA-06/` before/after moves, cleared indicators, and reload capture | F → `report.json` `areas["ai-agenda"].items[id="AIA-06"]`; `report.html#ai-agenda` |

#### Call for Papers

| ID | Manual check | `manual-results.json` record | Evidence to attach (when performed) | Finalize/report destination |
| --- | --- | --- | --- | --- |
| CFP-04 | Past close date produces a logged-out closed portal with no new submission path. | `manual-results.json["CFP-04"]` | `manual/CFP-04/` saved close-date setting and logged-out portal capture | F → `report.json` `areas["call-for-papers"].items[id="CFP-04"]`; `report.html#call-for-papers` |
| CFP-06 | Organizer sees submitted title, abstract, track, format, and custom fields intact. | `manual-results.json["CFP-06"]` | `manual/CFP-06/` list/detail captures and exact observed field values | F → `report.json` `areas["call-for-papers"].items[id="CFP-06"]`; `report.html#call-for-papers` |
| CFP-08 | Submission confirmation email (or in-app mail log) arrives and names the event/submission. | `manual-results.json["CFP-08"]` | `manual/CFP-08/` redacted message/log with recipient, subject, title, timestamp | F → `report.json` `areas["call-for-papers"].items[id="CFP-08"]`; `report.html#call-for-papers` |
| CFP-10 | Reviewer can be provisioned and sees a reviewer-only dashboard without admin capability. | `manual-results.json["CFP-10"]` | `manual/CFP-10/` invite/provisioning and reviewer dashboard captures | F → `report.json` `areas["call-for-papers"].items[id="CFP-10"]`; `report.html#call-for-papers` |
| CFP-11 | Reviewer rating/comment persists, completes the queue item, and is visible to organizer. | `manual-results.json["CFP-11"]` | `manual/CFP-11/` filled scorecard, completion, organizer view | F → `report.json` `areas["call-for-papers"].items[id="CFP-11"]`; `report.html#call-for-papers` |
| CFP-12 | Organizer decisions persist as distinct Accepted and Rejected statuses. | `manual-results.json["CFP-12"]` | `manual/CFP-12/` decision action and list captures | F → `report.json` `areas["call-for-papers"].items[id="CFP-12"]`; `report.html#call-for-papers` |
| CFP-13 | Accepted/Rejected statuses propagate to the submitter dashboard. | `manual-results.json["CFP-13"]` | `manual/CFP-13/` speaker dashboard capture and exact labels | F → `report.json` `areas["call-for-papers"].items[id="CFP-13"]`; `report.html#call-for-papers` |
| CFP-14 | Acceptance/rejection notifications are actually delivered, beyond UI queue confirmation. | `manual-results.json["CFP-14"]` | `manual/CFP-14/` redacted acceptance/rejection messages and dispatch UI | F → `report.json` `areas["call-for-papers"].items[id="CFP-14"]`; `report.html#call-for-papers` |
| CFP-15 | Accepted submission hands off to an agenda session without re-entering title/speaker/track. | `manual-results.json["CFP-15"]` | `manual/CFP-15/` accepted detail and matching session capture | F → `report.json` `areas["call-for-papers"].items[id="CFP-15"]`; `report.html#call-for-papers` |
| CFP-16 | After close, speaker submission is read-only and saves are rejected. | `manual-results.json["CFP-16"]` | `manual/CFP-16/` past-close setting plus locked speaker state | F → `report.json` `areas["call-for-papers"].items[id="CFP-16"]`; `report.html#call-for-papers` |
| CFP-17 | Organizer can create/switch to a second event and see both events. | `manual-results.json["CFP-17"]` | `manual/CFP-17/` event list/switcher, or explicit absence observation | F → `report.json` `areas["call-for-papers"].items[id="CFP-17"]`; `report.html#call-for-papers` |
| CFP-18 | Submissions/sessions/speakers remain isolated between two events. | `manual-results.json["CFP-18"]` | `manual/CFP-18/` paired event-scope captures and IDs | F → `report.json` `areas["call-for-papers"].items[id="CFP-18"]`; `report.html#call-for-papers` |

#### Content Management & Speaker Deliverables

| ID | Manual check | `manual-results.json` record | Evidence to attach (when performed) | Finalize/report destination |
| --- | --- | --- | --- | --- |
| CNT-02 | Speaker sees assigned tasks/deadlines and a file upload is recorded against the task. | `manual-results.json["CNT-02"]` | `manual/CNT-02/` task list and post-upload captures | F → `report.json` `areas["content-management"].items[id="CNT-02"]`; `report.html#content-management` |
| CNT-03 | Speaker sees only own sessions/tasks and cannot reach organizer/admin routes. | `manual-results.json["CNT-03"]` | `manual/CNT-03/` scoped portal and denial/not-found captures | F → `report.json` `areas["content-management"].items[id="CNT-03"]`; `report.html#content-management` |
| CNT-04 | Re-upload creates a current version while preserving prior versions. | `manual-results.json["CNT-04"]` | `manual/CNT-04/` two-version list, timestamps, and prior download/view | F → `report.json` `areas["content-management"].items[id="CNT-04"]`; `report.html#content-management` |
| CNT-05 | File comments show author/time and the same thread crosses speaker/organizer roles. | `manual-results.json["CNT-05"]` | `manual/CNT-05/` speaker and organizer thread captures | F → `report.json` `areas["content-management"].items[id="CNT-05"]`; `report.html#content-management` |
| CNT-06 | Upload control communicates accepted types and/or size constraints. | `manual-results.json["CNT-06"]` | `manual/CNT-06/` upload help/constraint capture | F → `report.json` `areas["content-management"].items[id="CNT-06"]`; `report.html#content-management` |
| CNT-08 | Bulk reminder action confirms send and real delivery/log is observed. | `manual-results.json["CNT-08"]` | `manual/CNT-08/` send confirmation plus redacted inbox/outbound log | F → `report.json` `areas["content-management"].items[id="CNT-08"]`; `report.html#content-management` |
| CNT-13 | Central files library shows upload session/speaker/date/version metadata. | `manual-results.json["CNT-13"]` | `manual/CNT-13/` library row and optional per-session tab | F → `report.json` `areas["content-management"].items[id="CNT-13"]`; `report.html#content-management` |
| CNT-14 | Multi-select export generates a ZIP containing only latest versions. | `manual-results.json["CNT-14"]` | `manual/CNT-14/` selection/generation plus redacted ZIP listing/hash | F → `report.json` `areas["content-management"].items[id="CNT-14"]`; `report.html#content-management` |

#### Public & Embeddable Widgets

| ID | Manual check | `manual-results.json` record | Evidence to attach (when performed) | Finalize/report destination |
| --- | --- | --- | --- | --- |
| EMB-11 | Personal schedule survives reload and exported calendar content is correct. | `manual-results.json["EMB-11"]` | `manual/EMB-11/` reload capture and imported/downloaded `.ics` evidence | F → `report.json` `areas["public-widgets"].items[id="EMB-11"]`; `report.html#public-widgets` |
| EMB-15 | Saved embed renders on a different origin for a non-admin and feeds are usable. | `manual-results.json["EMB-15"]` | `manual/EMB-15/` generated snippet, third-party render, and feed captures | F → `report.json` `areas["public-widgets"].items[id="EMB-15"]`; `report.html#public-widgets` |
| EMB-16 | Source edits propagate to attendee widgets without regenerating/re-saving the embed. | `manual-results.json["EMB-16"]` | `manual/EMB-16/` before/after source and attendee-widget captures | F → `report.json` `areas["public-widgets"].items[id="EMB-16"]`; `report.html#public-widgets` |

#### Speaker CRM

| ID | Manual check | `manual-results.json` record | Evidence to attach (when performed) | Finalize/report destination |
| --- | --- | --- | --- | --- |
| CRM-04 | Custom fields or tags persist on a contact profile after reload. | `manual-results.json["CRM-04"]` | `manual/CRM-04/` field/tag edit and reloaded profile | F → `report.json` `areas["speaker-crm"].items[id="CRM-04"]`; `report.html#speaker-crm` |
| CRM-06 | Near-duplicate contacts can be merged into a chosen primary record. | `manual-results.json["CRM-06"]` | `manual/CRM-06/` duplicate signal, merge choices, and surviving row | F → `report.json` `areas["speaker-crm"].items[id="CRM-06"]`; `report.html#speaker-crm` |
| CRM-11 | Bulk email previews personalization and confirms/logs send; real delivery is manual. | `manual-results.json["CRM-11"]` | `manual/CRM-11/` preview/send-history and redacted controlled inbox | F → `report.json` `areas["speaker-crm"].items[id="CRM-11"]`; `report.html#speaker-crm` |

#### Speaker Management

| ID | Manual check | `manual-results.json` record | Evidence to attach (when performed) | Finalize/report destination |
| --- | --- | --- | --- | --- |
| SPK-06 | Speaker invitation/onboarding email arrives and its portal link works. | `manual-results.json["SPK-06"]` | `manual/SPK-06/` invite dispatch and redacted message/link flow | F → `report.json` `areas["speaker-management"].items[id="SPK-06"]`; `report.html#speaker-management` |
| SPK-07 | Speaker portal identifies the speaker and exposes only that speaker's content. | `manual-results.json["SPK-07"]` | `manual/SPK-07/` authenticated portal scope and cross-user denial | F → `report.json` `areas["speaker-management"].items[id="SPK-07"]`; `report.html#speaker-management` |
| SPK-10 | Organizer can view/download a speaker upload with filename and metadata. | `manual-results.json["SPK-10"]` | `manual/SPK-10/` organizer listing/download and local integrity observation | F → `report.json` `areas["speaker-management"].items[id="SPK-10"]`; `report.html#speaker-management` |
| SPK-13 | General bulk speaker email is delivered/logged with recipient and timestamp. | `manual-results.json["SPK-13"]` | `manual/SPK-13/` recipient preview/send history and controlled inbox | F → `report.json` `areas["speaker-management"].items[id="SPK-13"]`; `report.html#speaker-management` |
| SPK-16 | Automated due-date reminder reaches a speaker without manual send. | `manual-results.json["SPK-16"]` | `manual/SPK-16/` due-date setup, redacted reminder, and communication history | F → `report.json` `areas["speaker-management"].items[id="SPK-16"]`; `report.html#speaker-management` |

The table contains 6 + 4 + 12 + 8 + 3 + 3 + 5 = **41** rows. IDs are
case-sensitive and globally unique. Do not substitute scenario IDs such as
`CFP-S4` for rubric IDs such as `CFP-14`; scenario captures are evidence
references only.

### Evidence classes and limitations

Manual evidence is a human-observed result from the deployed boundary or the
explicit provider/mail/calendar boundary named by the check. It is distinct
from automated/local checks (unit, integration, local Playwright, or mocked
provider), provider/deployed checks (health/configuration or a real staging
workflow), and LLM-judge output (the judge's `report.json` items and
`evidence_refs`). A provider being configured, a mock returning a valid shape,
or an LLM judge saying `pass` is not manual evidence. Manual records must cite
the boundary and retain limitations. If a required effect was not observed,
record `partial`, `fail`, or `not_found` when supported by the observation; if
evidence is insufficient, leave the item pending and document the
`cannot_judge` limitation outside the manual verdict.

The frozen evaluator configuration is **Terra medium for the agent and Sol high
for the judge**. This history contains no request to change those settings.
Local synthetic AI diagnostics remain local/mocked evidence and never become
deployed or release evidence by being copied into this ledger.

## Finalization checklist (operator gate)

Before running `finalize` for this run, compare the parsed key set of
`manual-results.json` with the 41 IDs above. Reject missing, unknown, duplicate,
placeholder, or invalid entries; require a reviewer, UTC timestamp, concrete
notes, and at least one redacted evidence reference for every row. Require
`pass` for every release-required row; `partial`, `fail`, and `not_found` stay
visible as non-passing limitations, and `cannot_judge` stays pending. For a
later run, perform the same validation against that run's generated pending
queue. Then run:

```bash
pnpm run finalize -- --run <run-dir>
```

Inspect `<run-dir>/report.json` and `<run-dir>/report.html` after the command.
The report is not accepted as release evidence unless every row in the table is
represented exactly once, `manualPending` is `0`, `scoreWithheld` is `false`,
and all limitation notes and evidence references remain attached. The current
command only warns/ignores unknown keys and leaves invalid/missing entries
pending; the operator gate above is therefore mandatory and is not implied by
the command's exit status.
