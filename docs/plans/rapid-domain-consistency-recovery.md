# Rapid Domain Consistency Recovery Plan

- Status: Ready for execution
- Date: 2026-08-12
- Repository: `/Users/jaeyunha/dev/open-sessionboard`
- Baseline branch and commit: `main` at `25e9033a31e93a1042a4cf9a7b9c47cb3a90c868`
- Objective: Use the maximum safe number of parallel worktrees and implementation sessions to repair chained evaluator workflows, domain consistency, and deployed evidence before the deadline.
- Completion target: A clean staging fixture completes every supported evaluator area with 100% coverage, zero pending manual checks, zero `fail` or `not_found` verdicts, and retained browser, API, provider, and file evidence.

---

## 1. Executive Decision

The main problem is not a lack of isolated screens. The application can interpret the same submission, participant, task, asset, or review assignment as different records at different workflow stages. The critical path therefore has three foundations:

1. Make `participantId` the single canonical event-speaker anchor.
2. Separate participant-scoped tasks from session-scoped tasks and require an explicit session per affected assignee.
3. Bind every successful mutation to an authoritative persisted revision and projection.

These foundations unblock most Speaker Management and Content Management failures together. Reviews, reminders, agenda/calendar, CRM reconciliation, and publication/embeds can proceed in separate worktrees at the same time.

A broad frontend redesign is active at:

`/Users/jaeyunha/wt/open-sessionboard/linear-notion-redesign`

That worktree must not be modified, stopped, rebased, or used as an implementation branch by this recovery effort. Backend and domain work starts immediately in separate worktrees. Feature UI work starts only after the redesign owner provides clean checkpoints and the integration coordinator establishes a new shared UI baseline.

---

## 2. Evidence Baseline

Latest completed diagnostic with manual checks resolved:

| Area | Score | Main blocker |
| --- | ---: | --- |
| Call for Papers | 88.2% | Post-submit portal context, duplicate-title handoff, reviewer provisioning evidence |
| Abstract Management | 55.4% | Second-reviewer assignment/replacement, delivered reminders, runnable advisory evaluation, complete exports |
| Speaker Management | 48.5% | Canonical participant mismatch, save/reload inconsistency, portal-to-organizer projection, automatic reminders |
| Content Management | 41.9% | Multi-session task assignment blocked the downstream upload/version/comment/export chain |
| Agenda | 86.1% | Create-to-immediate-use evidence, unscheduled-to-placed evidence, rejected candidate state |
| Public Widgets | 75.0% | Saved filter not enforced, approved source changes not propagated, headshot projection |
| Speaker CRM | 94.7% | Clean CSV import round trip and program-link reconciliation after merge |
| Overall | 65.9% | 100% coverage, zero pending manual checks |

This result describes one deployed diagnostic state, not the current source tree and not a release candidate. Several review, AI, versioning, and authorization capabilities already exist in source. Every lane must first classify each failure as one of the following before writing replacement code:

- Source behavior missing
- Source behavior present but defective
- Source fix present but not deployed
- Fixture defect
- Evidence-only gap
- Contract mismatch

Do not rebuild a capability merely because an older deployed run did not observe it.

---

## 3. Non-Negotiable Invariants

### 3.1 Data ownership

- Airtable remains authoritative for organizations, events, CFP forms, submissions, participants, profiles, reviews, decisions, tasks, sessions, agenda revisions, file metadata, CRM records, and publication-facing business records.
- D1 remains authoritative for identity, participant grants, idempotency/request receipts, durable outbox work, delivery attempts, reminder runs, operational audit, and upload lifecycle state.
- Durable Objects serialize event and agenda mutations. They do not become a parallel business-record database.
- R2 stores private objects and generated export artifacts.
- The single Cloudflare Queue carries typed communications, calendar, webhook, file-scan, and cache-invalidation work.

### 3.2 Identity

- `participantId` is the canonical event-speaker application ID.
- `speakerProfileId` identifies a participant profile projection. It is not the session, task, asset, or portal-authorization anchor.
- A CRM contact is an organization-level reusable contact linked to a participant. It does not replace event-participant identity.
- Email is a verified claim and candidate lookup signal, not a permanent foreign key.
- Display name, title, Airtable row order, Airtable record ID, application-ID length, and the first search result must never select a canonical participant.
- Ambiguous identity fails closed with an explicit resolution state.

### 3.3 Consequential mutations

Every consequential command must have:

- Tenant and event scope
- Server-side actor authorization
- Stable application IDs
- `expectedVersion`
- `idempotencyKey`
- A D1 operation/request receipt
- An audit event
- An authoritative returned entity and revision
- A stable outbox key for required side effects

The UI must not render a Queue enqueue or `{ ok: true }` as persisted completion. It must receive a re-read authoritative entity or show an explicit pending/failed operation state.

### 3.4 Publication

- Public pages, iframes, JSON feeds, and iCal feeds consume one served program-release manifest.
- Public routes never join draft Airtable records directly.
- Initial publication requires an explicit human action.
- An already-published item may create a new stored release automatically only after an approved, confirmed, or released source change.
- Publication states are `pending`, `served`, or `failed`; a missing first snapshot is never shown as current.

### 3.5 Human authority and AI

- Advisory output never automatically scores, decides, schedules, publishes, sends, exports, or overwrites source records.
- Counted scores require human confirmation.
- Applying, editing, or rejecting a candidate rechecks source and policy versions.
- Provider unavailability does not disable the manual workflow.

### 3.6 Evidence

- Source presence, mock tests, and provider configuration are not release evidence.
- A chained scenario passes the application IDs created by one step directly to later steps.
- Email, calendar, CSV, ZIP, JSON, and iCal checks inspect actual receipts or bytes.
- Production smoke does not replace staging acceptance.

---

## 4. Maximum-Safe Parallelization Model

## 4.1 Worktree lanes

Use one integration coordinator, up to seven concurrent backend/domain implementation lanes, then up to six concurrent UI lanes, followed by eight concurrent QA lanes.

| Lane | Worktree | Branch | Start condition |
| --- | --- | --- | --- |
| C0 Integration and contracts | `~/wt/open-sessionboard/recovery-integration` | `recovery/integration` | Immediately |
| C1 Fixture and evaluator chain | `~/wt/open-sessionboard/recovery-fixture` | `recovery/fixture-evidence` | Immediately |
| C2 Speaker core | `~/wt/open-sessionboard/recovery-speaker-core` | `recovery/speaker-core` | Contract Gate |
| C3 Reviews and evaluation | `~/wt/open-sessionboard/recovery-reviews` | `recovery/reviews` | Contract Gate |
| C4 Reminders and delivery | `~/wt/open-sessionboard/recovery-reminders` | `recovery/reminders` | Contract Gate |
| C5 Agenda and calendar | `~/wt/open-sessionboard/recovery-agenda` | `recovery/agenda-calendar` | Contract Gate |
| C6 CRM reconciliation | `~/wt/open-sessionboard/recovery-crm` | `recovery/crm-reconcile` | Contract Gate |
| C7 Publication and embeds | `~/wt/open-sessionboard/recovery-publication` | `recovery/publication-embeds` | Contract Gate |
| U1 Portal and speakers | `~/wt/open-sessionboard/recovery-ui-portal` | `recovery/ui-portal-speakers` | UI Baseline Gate |
| U2 Deliverables and files | `~/wt/open-sessionboard/recovery-ui-deliverables` | `recovery/ui-deliverables` | UI Baseline Gate |
| U3 Reviews and AI | `~/wt/open-sessionboard/recovery-ui-reviews` | `recovery/ui-reviews` | UI Baseline Gate |
| U4 Publish and embeds | `~/wt/open-sessionboard/recovery-ui-publish` | `recovery/ui-publish` | UI Baseline Gate |
| U5 Agenda | `~/wt/open-sessionboard/recovery-ui-agenda` | `recovery/ui-agenda` | UI Baseline Gate |
| U6 CRM and communications | `~/wt/open-sessionboard/recovery-ui-ops` | `recovery/ui-crm-comms` | UI Baseline Gate |

### Worktree bootstrap template

The coordinator creates branches from the same frozen integration base. Do not create a lane from another lane's unmerged branch.

```bash
git worktree add ~/wt/open-sessionboard/recovery-integration -b recovery/integration <frozen-base>
git worktree add ~/wt/open-sessionboard/recovery-fixture -b recovery/fixture-evidence <frozen-base>
```

After the Contract Gate is merged into `recovery/integration`, create C2-C7 from that exact integration commit. After the UI Baseline Gate, create U1-U6 from that exact integration commit.

## 4.2 File ownership rule

- C0 exclusively owns shared contracts, D1 migrations, and shared schema decisions.
- Each backend lane owns its domain service, routes, types, and focused tests.
- Backend lanes do not edit web feature files.
- UI lanes do not edit API services, Airtable adapters, D1 migrations, or shared domain contracts.
- A file has one active owner. Two sessions may not edit the same large service file simultaneously.
- Shared runtime adapters are assigned to one named owner and merged once.

The application has several very large service modules. Splitting one such module across multiple worktrees will create semantic conflicts and slow integration. Maximize concurrency across domains, not inside the same file.

## 4.3 Coordinator-only operations

Only the integration coordinator performs:

- Contract decision recording
- Shared schema and migration merges
- Redesign checkpoint integration
- Cross-lane conflict resolution
- Airtable and D1 staging migration execution
- Full repository check/test/build/Playwright gates
- Staging and production deployment
- Final fixture reset and evaluator run
- Evidence ledger updates

Domain lanes run focused tests only. They must not run repository-wide formatters that race with other worktrees.

## 4.4 Session handoff format

Every implementation session returns:

```text
Branch and HEAD
Owned files changed
Contract assumptions
Focused commands executed and observed results
Migration or deployment requirement
Known remaining blocker
Evidence artifacts created
```

Every commit closes one observable invariant. Avoid mixed “all fixes” commits.

---

## 5. Active Frontend Redesign Integration Boundary

## 5.1 Protected worktree

Do not modify:

`/Users/jaeyunha/wt/open-sessionboard/linear-notion-redesign`

The active direction is accepted as the future UI baseline:

- Organization/event-qualified admin routes
- Organization/event-qualified CFP routes
- Grouped organizer navigation
- Command palette
- Compact, neutral application shell
- Responsive sidebar/drawer
- Removal of event and organization inference from public environment fallbacks

## 5.2 Redesign checkpoint requirements

Before UI recovery lanes start, the redesign owner supplies separate clean commits for:

1. Shell, overview, and design tokens
2. Organization-qualified routes and context
3. Any feature-specific functional changes
4. Focused test and typecheck evidence

The current redesign worktree includes broad frontend changes and some API/runtime changes. The coordinator must not merge the entire worktree blindly. API/runtime changes require a semantic diff against the recovery contracts and are integrated once by the relevant backend owner or coordinator.

## 5.3 Files blocked until the UI Baseline Gate

Recovery UI lanes must not edit these paths before the checkpoint is integrated:

- `apps/web/src/features/admin/admin-shell.tsx`
- `apps/web/src/features/admin/admin-shell.module.css`
- `apps/web/src/features/admin/organizer-overview.tsx`
- `apps/web/src/features/cfp/*`
- `apps/web/src/features/portal/*`
- `apps/web/src/features/reviews/review-workspace.tsx`
- `apps/web/src/features/deliverables/deliverables-workspace.tsx`
- `apps/web/src/features/embed/*`
- `apps/web/src/features/embeds-admin/embed-workspace.tsx`
- Organization-qualified admin and CFP route files

## 5.4 UI rules after handoff

- Every scoped URL, breadcrumb, tab, command result, and navigation link retains organization and event context.
- No `NEXT_PUBLIC_*` organization/event fallback selects tenant scope.
- Use `AdminShell`, existing shadcn primitives, and feature-local CSS.
- Do not add recovery-specific global overrides to `admin-shell.module.css`.
- Distinguish loading, refreshing, stale, unavailable, empty, pending, and failed states.
- A save always ends in saved revision, retryable failure, or explicit conflict; it never remains indefinitely in “Saving.”
- Preserve visible focus, live regions, semantic tables, and named dialogs.

---

## 6. Dependency Graph

```text
Contract Gate
  ├── Speaker Core ───────┬── Portal/Speaker UI
  │                       ├── Deliverables/Files UI
  │                       ├── Reminder eligibility integration
  │                       ├── CRM contact-link reconciliation
  │                       └── Public speaker refresh
  ├── Reviews ────────────┬── Review/AI UI
  │                       └── Reviewer reminders
  ├── Agenda ─────────────┬── Agenda UI
  │                       └── Program release refresh
  ├── Delivery Ledger ────┬── Communications UI
  │                       └── Provider evidence
  ├── CRM ────────────────└── CRM UI
  └── Publication ────────┬── Embed UI
                          └── Public evidence

Redesign Checkpoint + Backend Integration = UI Baseline Gate
UI Baseline Gate + Clean Fixture = Full End-to-End Gate
```

Speaker Core is the longest critical path. Reviews, agenda, delivery, CRM, publication, and the clean fixture proceed concurrently. Their final participant-link adapter commits wait for the canonical participant contract, but their domain logic does not.

---

## 7. Wave 0 — Kickoff and Source Audit

Target: complete immediately before broad implementation.

### 7.1 Freeze the baseline

Record:

- Main branch HEAD
- Redesign branch HEAD and dirty-state inventory
- Integration-base commit
- Current staging and production Worker version IDs
- Airtable schema fingerprint
- D1 migration version
- Evaluator fixture manifest version

Preserve existing unrelated changes in the main worktree. Do not include `apps/web/next-env.d.ts` or session artifacts in recovery branches.

### 7.2 Build a source-versus-deployment matrix

Each domain owner maps every diagnostic failure to current code and focused tests. Output one row per criterion:

```text
Criterion
Observed deployed failure
Current source behavior
Classification
Owner lane
Required implementation or evidence
```

### 7.3 Freeze six contract decisions

C0 records the exact wire and persistence semantics for:

1. Canonical participant identity and grant
2. Participant/session task subjects
3. Authoritative mutation response envelope
4. Asset family pointers
5. Review replacement/version rules
6. Program/embed revision and reminder lifecycle

No breaking rename is allowed after the Contract Gate without coordinator approval.

---

## 8. Wave 1 — Contract Gate and Clean Fixture in Parallel

## 8.1 C0: Contracts, schema additions, and cutover rules

### Owned files

- `packages/contracts/src/domain/ids.ts`
- `packages/contracts/src/domain/submissions.ts`
- `packages/contracts/src/domain/tasks.ts`
- `packages/contracts/src/domain/reviews.ts`
- Related contract tests
- One new D1 migration
- Required additive changes in `scripts/airtable/provision.mjs`

### Canonical participant contract

Continue using the existing stable `participantId`; do not introduce a parallel event-speaker ID.

Required participant business fields or equivalent validated metadata:

- `organizationId`
- `eventId`
- `submissionId`
- Optional `crmContactId`
- Normalized email
- `identityState: resolved | ambiguous | unclaimed`
- `sourceType: cfp | manual | csv | crm`
- `sourceId`
- Optional claimed user ID
- Version

Speaker profile remains a one-to-one event participant projection.

Replace the D1 grant anchor with `(organizationId, eventId, participantId, userId)`. Backfill legacy grants through exact Airtable participant/profile relations. Remove the legacy runtime authorization path at cutover; do not leave a dual-read fallback.

### Task contract

```ts
subject:
  | { type: "participant"; participantId: string }
  | { type: "session"; participantId: string; submissionId: string }
```

Organizer creation input:

```ts
assignments: Array<{
  participantId: string;
  submissionId: string | null;
}>
```

Rules:

- Participant subject requires `submissionId: null`.
- Session subject requires an accepted submission.
- The submission must contain the participant.
- Duplicate participant/session pairs in one command are rejected.
- Each persisted task has one subject.
- Remove the global `submissionId + assigneeIds[]` request shape; do not retain a compatibility fallback.

### Mutation response envelope

```ts
{
  data: T;
  operation: {
    id: string;
    state: "completed" | "pending" | "failed";
    revision: number;
  };
}
```

A command that has only enqueued an external effect returns `pending` for that effect, not completed delivery.

### Asset pointers

A task file request owns one logical asset family with immutable versions and explicit pointers:

- `latestVersionId`
- `currentVersionId`
- `approvedVersionId`
- `releasedVersionId`

A profile's `headshotAssetId` is the authoritative current headshot pointer. No surface independently picks “latest” by timestamp or row order.

### Review contract

- Opening a plan freezes grading policy and round definitions.
- Assignment and review each have an independent version.
- Replacement requires old assignment ID, replacement reviewer ID, expected version, and reason.
- Replaced assignment history is retained as `superseded` with predecessor/successor links.
- Aggregates are keyed by round/version and never raw-average unrelated rounds.

### D1 operational additions

Add only operational state:

- Participant-scoped grants
- `reminder_runs`
- `reminder_dispatches`
- Publication rebuild receipts or an explicit extension of existing outbox receipts

Do not copy program business records into D1.

### Contract Gate acceptance

- Contracts build and typecheck.
- Invalid participant/session task combinations fail schema validation.
- Counted AI scores require human confirmation.
- Replacement input requires old/new/reason/version.
- Fresh D1 migration and prior-schema upgrade tests pass.
- Airtable provisioning dry-run reports additions only, with no field/table deletion or rename.

## 8.2 C1: Clean fixture and chained IDs

### Owned files

- `scripts/eval/devflow-fixture.json`
- `scripts/eval/seed-devflow.mjs`
- `scripts/eval/repair-devflow-production.mjs`
- `scripts/eval/production-repair-adapter.mjs`
- Their focused tests

### Split foundation from scenario-owned records

Foundation records may include:

- Organization and event
- Personas and roles
- Form definitions and reusable library data
- Rooms, tracks, and formats
- Email templates and safe provider configuration
- Minimal runtime state that scenarios cannot create

Scenario-owned records must be empty after reset:

- Proposals and their participants
- Review assignments, reviews, and decisions
- Sessions/roster created by acceptance
- Tasks, assets, versions, and comments created by content scenarios
- CRM contacts imported by CRM scenarios

If an agenda scenario needs a prebuilt session, use a dedicated title and participant that cannot overlap with CFP or speaker scenarios.

### Chain context

Persist the application IDs returned by each step:

```text
submissionId
participantIds
reviewPlanId
assignmentIds
sessionIds
taskIds
assetFamilyIds
embedConfigurationId
crmContactIds
```

Later scenarios must use these IDs instead of title/name/email searches.

### Fixture acceptance

- Reset is idempotent.
- Scenario-owned namespaces are empty after reset.
- No duplicate normalized participant identity exists.
- Chain context never exposes Airtable record IDs.
- Reset is restricted to staging/evaluator environments.
- Destructive production reset requires an explicit environment and manifest confirmation.

---

## 9. Wave 2 — Six Backend Lanes in Parallel

Start C2-C7 together immediately after the Contract Gate merges.

## 9.1 C2: Speaker Core, portal ownership, tasks, and assets

### Owned scope

- `apps/api/src/features/speaker/types.ts`
- `apps/api/src/features/speaker/service.ts`
- `apps/api/src/features/speaker/routes.ts`
- Speaker and private-asset focused tests
- One explicitly assigned Airtable speaker adapter owner

Only one session edits the large speaker service at a time. Other C2 sessions may own routes or tests, but not overlapping sections of the same file.

### Canonical resolver

```ts
resolveEventParticipant({
  organizationId,
  eventId,
  sourceType,
  sourceId,
  normalizedEmail,
})
```

Resolution order:

1. Exact source relationship
2. Explicit participant ID
3. Unique event plus normalized email
4. Create if none exists
5. Return explicit ambiguity if multiple candidates exist

Manual add, CFP acceptance, CSV speaker import, and CRM add-to-event use the same resolver.

### Post-submit portal capability projection

Portal context is not an all-or-nothing accepted-speaker workspace. It contains independent capabilities:

- Owned submissions from submitter ownership
- Profile/tasks/assets from participant grants
- Managed sessions from explicit session relationships

A submitter sees submission status immediately after submission and before acceptance. Acceptance reuses the existing participant relation and adds session/task capabilities.

### Authoritative writes

Profile, organizer status, logistics, roster, and task commands:

1. Validate actor, scope, and expected version.
2. Write Airtable.
3. Re-read the exact application ID.
4. Verify the new revision.
5. Return that re-read projection and operation state.

Stale writes return conflict. Persistence failure never produces success UI.

### Participant/session tasks

- Participant scope: profile, headshot, general logistics
- Session scope: slides, session copy, recording assets
- A participant with one accepted session may receive a suggested default.
- Multiple sessions never produce an implicit default.
- Server projections include participant and session labels from exact relations.

### Asset families

- Immutable versions
- Server-owned current/approved/released pointers
- Comments optionally bind to a version ID
- Portal, organizer, file library, and export use one pointer resolver
- R2 object keys never enter API responses
- ZIP uses released or explicitly authorized current versions only

### C2 acceptance

- Ambiguous identity returns `IDENTITY_AMBIGUOUS` without mutation.
- Organizer and portal observe the same participant/profile revision.
- Post-submit dashboard works before acceptance.
- A multi-session participant can receive separate session tasks.
- A participant task remains one task across sessions.
- Uploading v1/v2 preserves both versions and one shared current pointer.
- Version comments remain attached to the intended version.
- ZIP manifest matches authoritative pointers.

## 9.2 C3: Reviews, replacement, and advisory evaluation

### Owned scope

- `apps/api/src/features/evaluations/types.ts`
- `apps/api/src/features/evaluations/service.ts`
- `apps/api/src/features/evaluations/repository.ts`
- `apps/api/src/features/evaluations/routes.ts`
- Evaluation focused tests

### Audit source first

Focused tests must first confirm current source behavior for:

- Server open/close guards
- Reviewer cap
- Auto-distribution and track filter
- Blind reviewer projection
- AI suggestion generation/resolution
- Review version CAS

Retain working behavior and repair only missing invariants.

### Required changes

1. Freeze rubric, anonymization, and windows when the plan opens.
2. Allow grading-policy edits only while draft.
3. Replace assignments in one repository command.
4. Preserve old assignment/review evidence and mark superseded lineage.
5. Return exact desired assignments, deficits, exclusions, and fingerprint from preview.
6. Recompute and compare the fingerprint before apply.
7. Aggregate per round/version only.
8. Use C4 durable delivery for reviewer reminders.
9. Persist AI source/rubric revisions and provider provenance.
10. Require human audited accept/edit/reject with expected version.

### C3 acceptance

- Second-reviewer replacement appears in both reviewer queue and organizer table immediately.
- Replaced review evidence remains available in history.
- Reviewers cannot see each other's private scores/comments.
- Direct API save/submit after close is rejected.
- An open plan rejects rubric/anonymization edits.
- Different round scales are never combined into one raw average.
- AI candidates do not count until confirmed.
- Stale candidate apply is rejected.
- Provider unavailable leaves manual review usable.

## 9.3 C4: Reminders and delivery truth

### Owned scope

- `apps/api/src/features/communications/types.ts`
- `apps/api/src/features/communications/service.ts`
- Communication focused tests
- Assigned Queue communication consumer/adapter files
- Production Cron reminder dispatcher files

### Durable reminder model

`ReminderRun` records:

- Event ID
- Automatic or manual trigger
- Candidate, eligible, queued, skipped, and failed counts
- Start/completion time
- Configuration failure

`ReminderDispatch` records:

- Recipient
- Task/review IDs
- Eligibility reason
- Cadence window
- Deterministic idempotency key
- Outbox job ID
- Provider message ID
- Terminal status

Lifecycle:

```text
candidate -> eligible -> queued -> provider_accepted -> delivered
                                             └──────> failed/bounced
```

### Rules

- Automatic and manual reminder facts remain distinct.
- Queue insertion is not delivery success.
- Provider callbacks update terminal status.
- Invalid Cron configuration creates a durable failed run.
- A retry in the same cadence window reuses the dispatch key.
- Participant task and reviewer reminders use the same delivery ledger.
- If previewed audience revision changes before send, require reconfirmation.

### C4 acceptance

- Due-soon automatic run creates a dispatch without manual action.
- Repeated Cron/Queue execution does not duplicate mail.
- Missing address is an explicit skip.
- Provider rejection is visible as failed.
- Reviewer/task reminders trace from run to outbox to provider/inbox.
- Facts query returns last automatic, last manual, next eligible, and last outcome.

## 9.4 C5: Agenda and calendar commitments

### Owned scope

- `apps/api/src/features/agenda/types.ts`
- `apps/api/src/features/agenda/conflicts.ts`
- `apps/api/src/features/agenda/engine.ts`
- Agenda routes and focused tests
- Assigned calendar adapter files

### Required changes

- Separate authoritative draft conflicts from rejected candidate diagnostics.
- Placement failure does not mutate the draft.
- Return candidate diagnostics separately from saved preview.
- Release checks other sessions' still-active released speaker commitments.
- A session update excludes its own old slot from self-conflict.
- Store REQUEST/UPDATE/CANCEL intent separately from delivery attempt.
- Preserve failed CANCEL payload, UID, and sequence for repair.
- Room/track creation becomes available immediately after catalog synchronization.

### C5 acceptance

- Rejected placement leaves no phantom saved conflict.
- Stale draft update is rejected and authoritative preview remains intact.
- A released old slot blocks another session for the same speaker.
- Updating that same session does not conflict with itself.
- Calendar sequence increases monotonically.
- Failed cancellation remains repairable.
- Unscheduled-to-manually-placed-to-reload round trip passes.

## 9.5 C6: CRM contact and program-link reconciliation

### Owned scope

- `apps/api/src/features/crm/types.ts`
- `apps/api/src/features/crm/service.ts`
- `apps/api/src/features/crm/routes.ts`
- CRM focused tests

### Merge boundary

CRM contact merge and participant identity merge are different commands. CRM merge combines CRM provenance and safely redirects program-side contact links; it never changes authorization anchors.

Result shape:

```ts
{
  survivorId;
  retiredIds;
  rewired: {
    participantContactLinks;
    notes;
    segments;
    pipelineHistory;
  };
  participantConflicts;
  auditId;
}
```

Rules:

- If two distinct participants in one event link to the contacts being merged, return an explicit participant conflict.
- CRM merge does not modify `participantId`, portal grants, task ownership, asset ownership, roster membership, reviewer access, or historical recipient snapshots.
- A safe participant link may update only `crmContactId` to the survivor.
- Actual participant reconciliation is a separate C2 identity-resolution command.
- Preserve historical message/recipient snapshots; redirect only active lookup relationships.
- Retry returns the same result.

### C6 acceptance

- Active business lookup no longer uses retired CRM IDs.
- Participant collision is explicit and changes no permissions.
- Safe CRM links, notes, segments, and pipeline history reconcile to the survivor.
- Portal, task, asset, roster, and reviewer authorization are unchanged.
- Clean CSV preview-to-commit-to-reload passes.
- Import reports per-row created, updated, skipped, and error outcomes.

## 9.6 C7: Program publication and saved embeds

### Owned scope

- `apps/api/src/features/events/types.ts`
- `apps/api/src/features/events/service.ts`
- `apps/api/src/features/events/routes.ts`
- Public agenda/speaker/embed routes and tests
- Exclusively assigned public projection resolver files

The coordinator resolves overlap with active redesign API/runtime changes.

### Saved embed resource

Persist:

- Stable configuration ID
- Event ID
- Widget type
- Stable `trackIds`, never display names
- Field mask
- Layout/theme
- Enabled flag
- Configuration revision

Organizer preview, iframe, JSON, and iCal all use the same resolver.

### Program release manifest

One immutable manifest binds:

- Agenda revision ID
- Speaker projection revision ID
- Source hashes
- Approved content/profile/asset revisions
- Actor and published time
- `pending | served | failed`
- Parent revision

Public readers use only child projections referenced by the current served manifest.

### Approved automatic refresh

If publication intent already exists, these changes enqueue a rebuild:

- Confirmed public profile update
- Approved session-content update
- Released asset-pointer update
- Released schedule update

These never auto-publish:

- Unapproved draft
- New unpublished session
- Unconfirmed participant
- Backstage/private field

### C7 acceptance

- Track-scoped embed excludes all other tracks.
- Track rename preserves filtering through stable ID.
- Preview, public HTML, JSON, and iCal share config/program revisions.
- First rebuild failure is visible as failed.
- Approved edits create a new served revision without re-saving the embed.
- Draft edits remain private.
- Published headshots render through authorized public projection.
- Rollback creates a new current manifest referencing the prior content revision.

---

## 10. Wave 3 — Backend Integration and Staging Cutover

## 10.1 Merge order

1. C0 contracts and migrations
2. C1 fixture tests
3. C2 speaker core
4. C3 reviews
5. C4 delivery ledger
6. C5 agenda
7. C6 CRM reconciliation
8. C7 publication
9. Cross-domain adapter commits

Before merge, each owner rebases onto the latest integration HEAD and reruns focused tests. The coordinator resolves conflicts; the lane owner reviews the semantic result.

## 10.2 Airtable cutover

1. Read metadata and dry-run provisioning.
2. Add required fields/tables only.
3. Generate canonical participant ambiguity report.
4. Resolve ambiguous rows explicitly.
5. Backfill stable application relationships.
6. Switch repository read/write contract.
7. Remove old inference paths.
8. Run post-cutover invariant queries.

Do not automatically delete or rename Airtable fields. Runtime fallback code, however, is removed at atomic cutover.

## 10.3 D1 cutover

1. Export/backup staging D1.
2. Apply migration.
3. Backfill participant grants from exact Airtable participant/profile relationships.
4. Validate counts and references.
5. Switch authorization code.
6. Remove legacy grant access path.
7. Enable automatic reminder dispatcher.

## 10.4 Backend Integration Gate

Coordinator runs:

```bash
bun run --filter @open-sessionboard/contracts build
bun run --filter @open-sessionboard/api typecheck
bun run test -- apps/api/src/features/speaker/speaker.test.ts
bun run test -- apps/api/src/features/speaker/private-asset-lifecycle.test.ts
bun run test -- apps/api/src/features/evaluations/service.test.ts
bun run test -- apps/api/src/features/evaluations/routes.test.ts
bun run test -- apps/api/src/features/communications/service.test.ts
bun run test -- apps/api/src/features/agenda/engine.test.ts
bun run test -- apps/api/src/features/crm/service.test.ts
bun run test -- tests/runtime/local-worker.test.ts
```

Do not start UI lanes while this gate is red.

---

## 11. Wave 4 — Six UI Lanes in Parallel

Start only after:

- Redesign checkpoints are integrated.
- Backend Integration Gate passes.
- Organization/event-qualified routing is canonical.
- API wire contracts are frozen.

## 11.1 U1: Portal and Speaker UI

Owned feature scope:

- Portal provider/model/home/profile/submissions
- Speaker workspace
- Corresponding feature tests

Required behavior:

- Post-submit owned submission context
- Participant/event context switching
- Organizer and portal display the same revision
- Explicit saving, pending, saved, conflict, and failure states
- Profile, headshot, status, and logistics survive reload
- No-access and cross-event states fail closed

## 11.2 U2: Deliverables and Files UI

Owned feature scope:

- Deliverables workspace
- Portal tasks
- Organizer files view
- Corresponding tests

Required behavior:

- Participant/session subject selector
- Explicit session selection for multi-session participants
- Allowed MIME types and maximum size at upload point
- Version-specific comments
- Current/approved/released badges
- Latest-authorized export manifest and asynchronous export state

## 11.3 U3: Reviews and AI UI

Owned feature scope:

- Review workspace
- Evaluation controls
- Corresponding tests

Required behavior:

- Distribution preview, deficits, exclusions, and fingerprint
- Atomic replacement result
- Reviewer queue isolation
- Round-specific aggregate and sorting
- AI generate, rationale, accept/edit/reject
- Stale and unavailable states
- Delivered reminder facts

## 11.4 U4: Publish and Embed UI

Owned feature scope:

- Embed administration
- Public embed components
- Corresponding tests

Required behavior:

- Stable track selection
- Saved configuration revision
- Served program revision
- Pending/failed rebuild state
- Preview/public parity
- Copyable iframe, JSON, and iCal outputs

Preserve the active public visual redesign while replacing only the data contract/resolver.

## 11.5 U5: Agenda UI

Owned feature scope:

- Agenda workspace
- Feature-local tests and CSS

Required behavior:

- Saved conflicts and rejected candidate diagnostics are separate
- Failure triggers authoritative refetch
- Room/track create-to-immediate-use
- Clear unscheduled-to-place flow
- Released commitment and calendar repair state

## 11.6 U6: CRM and Communications UI

Owned feature scope:

- CRM workspace
- Communications/delivery workspace
- Corresponding tests

Required behavior:

- Relationship-aware merge preview/result/conflict
- CSV preview and per-row commit results
- Automatic/manual reminder facts
- Provider-accepted, delivered, failed, and bounced states
- Retry action and audit reference

## 11.7 UI Gate

Coordinator runs focused feature suites, then:

```bash
bun run --filter @open-sessionboard/web typecheck
bun run --filter @open-sessionboard/web build
```

The gate also requires desktop and mobile browser QA for the shared shell, scoped routes, keyboard focus, command palette, dialogs, tables, and horizontal overflow.

---

## 12. Wave 5 — Eight Parallel QA Lanes

Once an integrated staging build is ready, close implementation sessions and open read-only QA sessions. QA lanes do not edit code; findings return to the owning implementation lane.

| QA lane | Workflow | Required artifacts |
| --- | --- | --- |
| Q1 CFP and Review chain | Submit, portal, assign, review, decide | Application IDs, screenshots, API responses |
| Q2 Speaker and Content | Profile, tasks, v1/v2, comments, ZIP | Hashes, ZIP listing, cross-role screenshots |
| Q3 Delivery | Reviewer and automatic task reminders | Run ID, outbox ID, provider ID, controlled inbox evidence |
| Q4 Agenda and Calendar | Create resource, place, publish, update, cancel | Revision, `.ics`, sequence, delivery receipts |
| Q5 Public and Embed | Saved filter, third-origin iframe, approved refresh | Config/program revisions, JSON/iCal, screenshots |
| Q6 CRM | CSV import, merge, program-link reconciliation | Row results, relation counts, audit ID |
| Q7 Advisory AI | Agenda, evaluation, and remix provider workflows | Provenance, human action, reload/audit, stale/unavailable |
| Q8 Security and Accessibility | Tenant denial, keyboard, mobile, focus | Denial responses and accessibility captures |

### QA evidence rules

- Exclude secrets, cookies, tokens, and raw private payloads.
- Redact recipients and provider identifiers where required.
- Retain safe file hashes and archive listings.
- Minimize private data in screenshots.
- Store scenario evidence in the evaluator run directory.
- Add a dated entry to `docs/llm-judge-runs.md` only after the run is finalized.

---

## 13. End-to-End Acceptance Matrix

## 13.1 CFP and portal

- A clean account creates a proposal and participants.
- Submit returns canonical application IDs.
- Confirmation immediately opens the owned submission dashboard.
- Reviewer invitation and acceptance are captured.
- Review attaches to the exact chained submission.
- Acceptance creates one session with title, format, track, and participants intact.

## 13.2 Reviews

- Two named rounds use the intended rubric input types.
- Cap, auto-distribution, and track-filter controls are observable.
- Two reviewers are assigned and isolated.
- Replacement persists atomically.
- Progress reflects actual assignments.
- Reminder is delivered, not merely queued.
- Exported CSV is opened and validated.
- Advisory evaluation returns a numeric suggestion, written rationale, and human override controls.

## 13.3 Speaker Management

- Organizer add/edit/status/logistics survive reload.
- CSV import completes with expected rows.
- Portal profile/headshot appears in organizer projection.
- No duplicate person projection exists.
- Automatic due reminder is delivered.
- Public speaker surfaces render an actual published headshot.

## 13.4 Content Management

- A multi-session participant receives the correct session tasks.
- Portal shows task due dates and file policy.
- One family supports v1/v2 history.
- Speaker and organizer comments target the same version.
- Organizer matrix reflects mixed completion states.
- ZIP contains only the selected current/released versions.
- Attribution shows a human display label rather than an opaque UUID.
- Approved and unapproved public eligibility is verified.

## 13.5 Agenda and Calendar

- New room and track are immediately usable.
- An unscheduled session is manually placed and survives reload.
- Hard conflicts block placement/publication.
- Rejected candidate does not pollute saved preview.
- Released speaker commitment prevents calendar double booking.
- REQUEST, UPDATE, and CANCEL bytes and delivery are verified.

## 13.6 Public Widgets

- Gallery, list, agenda, itinerary, JSON, and iCal use one served release.
- Published headshots render.
- Saved track filter applies on public URL and third-party origin.
- iCal bytes import correctly.
- Approved source edit creates a new served release without re-saving embed configuration.
- Draft edit remains private.

## 13.7 CRM

- Clean CSV import round trip passes.
- Duplicate detection and explicit merge are observable.
- Participant-link conflict is visible.
- Safe CRM relations reconcile.
- Retired contact IDs are not used by active lookup.
- Authorization remains unchanged.

---

## 14. Risk Controls

### 14.1 Worktree and merge risk

- Enforce the file ownership table.
- Shared contracts belong only to C0.
- Shared runtime adapters have one owner.
- Never edit the active redesign worktree.
- Run formatting only after integration.

### 14.2 Cross-store partial failure

- Require idempotency keys.
- Persist D1 operation receipt before external side effects.
- Re-read Airtable after writes.
- Reconcile stuck `processing` receipts.
- Queue retry never repeats a business mutation.

### 14.3 Identity migration risk

- Produce a dry-run ambiguity report.
- Never auto-merge multiple participants by email/name.
- Audit exact application-ID relationships.
- Cut participant grants over once.
- Test cross-event and cross-tenant denial.

### 14.4 Publication privacy risk

- Use a typed allowlist projection.
- Never serve draft live reads.
- Publish confirmed participants only.
- Exclude private R2 object keys.
- Record source and projection hashes.

### 14.5 CRM authorization risk

- CRM merge may redirect `crmContactId` links only.
- It must not mutate participant IDs or grants.
- Historical recipients remain immutable snapshots.
- Participant reconciliation requires a separate explicit identity operation.

### 14.6 Deadline risk

Prioritize work that opens the largest blocked evaluator chain:

1. Clean fixture and chained IDs
2. Canonical participant and portal ownership
3. Multi-session tasks and asset pointers
4. Authoritative save/reload
5. Review replacement and delivered reminders
6. Saved filters and approved publication refresh
7. Agenda released commitments
8. CRM reconciliation
9. Advisory evaluation and remaining evidence

Do not add unrelated abstractions, redesign systems, optional integrations, or broad refactors.

---

## 15. Maximum-Concurrency Schedule

### T0 — Immediate

Run three sessions in parallel:

- C0 snapshot and contracts
- C1 fixture cleanup
- Existing redesign owner completes checkpoints

### T1 — Contract Gate

Run seven implementation sessions in parallel:

- C2 Speaker Core
- C3 Reviews
- C4 Delivery
- C5 Agenda
- C6 CRM
- C7 Publication
- C1 fixture and evaluator tests continue

This is the maximum useful backend concurrency without shared-file collision.

### T2 — Backend integration

- Coordinator merges and runs gates.
- Lane owners respond only to semantic conflicts or failed focused tests.
- Redesign owner finalizes clean checkpoints.

### T3 — UI Baseline Gate

Run six UI sessions in parallel:

- U1 Portal/Speakers
- U2 Deliverables/Files
- U3 Reviews/AI
- U4 Publish/Embeds
- U5 Agenda
- U6 CRM/Communications

### T4 — QA

Run Q1-Q8 in parallel. Return findings to the original owner lanes. The coordinator alone runs full gates, deploys, resets fixtures, finalizes the evaluator, and updates the evidence ledger.

---

## 16. Final Gates

### Source gate

```bash
bun run check
bun run test
bun run build
bun run test:e2e
```

### Deployment gate

- Staging web/API versions pinned
- Airtable schema fingerprint recorded
- D1 migrations applied
- Queue and Cron bindings verified
- OpenSend sender and callbacks verified
- Real-provider advisory workflows verified in staging

### Product/evidence gate

- Clean reset followed by full chained run
- 100% coverage
- Zero pending manual checks
- Zero `fail` and `not_found` verdicts
- Real mail, calendar, export, and third-origin evidence
- Accessibility, mobile, and tenant-denial evidence
- Evidence ledger updated with deploy versions and limitations

Production receives bounded smoke only after staging acceptance.

---

## 17. Immediate Kickoff Checklist

- [ ] Create C0 integration worktree and freeze base commit.
- [ ] Create C1 fixture worktree.
- [ ] Obtain redesign checkpoint commits and handoff evidence.
- [ ] Complete source-versus-deployment classification.
- [ ] Freeze the six contracts.
- [ ] Merge the Contract Gate.
- [ ] Create C2-C7 worktrees from the same integration commit.
- [ ] Assign one owner per large/shared file.
- [ ] Complete backend focused tests.
- [ ] Rehearse and apply staging Airtable/D1 cutover.
- [ ] Integrate redesign checkpoints and pass the UI Baseline Gate.
- [ ] Create and run U1-U6 in parallel.
- [ ] Pass full source gates.
- [ ] Reset clean staging fixture.
- [ ] Run Q1-Q8 evidence lanes in parallel.
- [ ] Finalize evaluator output and record the ledger entry.

Do not claim completion or a perfect score until every final gate is closed with current deployed evidence.
