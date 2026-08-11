# Deep Interview Spec: Open Sessionboard

## Metadata
- Interview ID: 8e0e9dd1-6c9a-4b20-93a1-4c6ee2ef76b7
- Rounds: 29
- Final Ambiguity Score: 1.8%
- Type: brownfield
- Generated: 2026-08-08
- Threshold: 0.05
- Threshold Source: default
- Initial Context Summarized: no
- Status: PASSED
- Auto-Researched Rounds: none
- Auto-Answered Rounds: 5, 19
- Architect Failures: 0
- Lateral Reviews: 4 — initial→progress stack review; speaker-access pre-answer review; progress→refined gap review; refined→ready closure review
- Lateral Panel Failures: 0
- Refined Rounds: 0, 2, 3, 4, 6, 10, 17, 25, 27
- Closure Overrides: 1, resolved in Round 24
- Restated Goal: Deliver an evidence-driven, production-grade, public-at-submission open-source program-side Sessionboard alternative—not its CRM/marketing suite or a pixel-for-pixel replica—that covers configurable submissions, secure speaker operations, human-authoritative review/communications, conflict-safe versioned scheduling, and Cloudflare/Airtable/Forge/OpenSend/API/public-embed distribution; execute it exclusively through GJC-native workflows, remove all legacy orchestration and inherited Git history, start from one clean private-Forge baseline commit, verify real interactions with Ever and the `codex-cua` skill, rewrite `README.md` for the resulting project, and make the repository public only when the mandatory end-to-end release gate passes for submission.

## Clarity Breakdown
| Dimension | Score | Weight | Weighted |
|-----------|-------|--------|----------|
| Goal Clarity | 0.99 | 0.35 | 0.347 |
| Constraint Clarity | 0.98 | 0.25 | 0.245 |
| Success Criteria | 0.99 | 0.25 | 0.248 |
| Context Clarity | 0.98 | 0.15 | 0.147 |
| **Total Clarity** | | | **0.982** |
| **Ambiguity** | | | **0.018** |

## Locked Intent
Every Round 0 locked intent item is preserved.

### Artifacts
- artifact:prd — a GJC-authored PRD derived from the evidence corpus.
- artifact:visual-references — PDF screenshots and user-supplied screenshots placed in `evidence/` with a page/context manifest.
- artifact:opensource-repo — a private-during-development, public-at-submission open-source repository.
- artifact:lean-repository — a clean GJC-native project with no legacy orchestration or inherited template Git history.
- artifact:deployed-clone — a deployed, evaluator-testable scoped alternative.

### Surfaces
- surface:admin-program — organizer administration.
- surface:speaker-portal — speaker self-service.
- surface:public-embeds — public speaker gallery and itinerary embeds.

### Integrations
- integration:calendar — provider-neutral RFC 5545 REQUEST/UPDATE/CANCEL delivery through OpenSend for Gmail, Outlook, Apple Calendar, and generic iCal clients, including room and video details when present.
- integration:gjc — GJC owns onboarding and PRD creation.
Microsoft OAuth and Accelevents are intentionally not part of this build. No Microsoft OAuth or Accelevents credentials, setup, runtime adapter, dependency, or release gate is required.

### Constraints
- constraint:pdf-authority — the PDF and its images are primary evidence.
- constraint:no-full-clone — do not clone all Sessionboard modules.
- constraint:skip-interactive-inspect — replace original-product Inspect with evidence extraction and focused research.
- constraint:good-enough — exact visual cloning is unnecessary, while the supplied Sessionboard UI remains the visual reference.
- constraint:performance — the replacement must avoid Sessionboard’s observed slowness and meet explicit budgets.

## Topology
| Component | Status | Description | Coverage / Deferral Note |
|-----------|--------|-------------|--------------------------|
| Submission intake | active | Configurable CFP forms, conditional logic, routing, public/account workflow, drafts, and submission lifecycle. | Requires the five-step CFP wizard, dynamic published schemas, reusable/versioned tenant fields, file requests, rule validation/routing, versioned edits, and golden-path tests. |
| Speaker operations | active | Speaker profiles, files, tasks, forms, status, and organizer visibility. | Requires per-participant authorization, portal context switching, autosave/editing, co-speaker roster control, private asset finalization/history/comments/downloads, form tasks, wiki/resources, and task lifecycle. |
| Review and communications | active | Multi-round review, human-approved AI assistance, templates, reminders, decisions, reports, and calendar lifecycle. | Requires authorable/versioned evaluation plans and visibility projections, human-applied advisory AI suggestions, accept/waitlist/reject delivery, template-managed event email, grade/report exports, OpenSend, and RFC 5545 updates/cancellations. |
| Program scheduling | active | Conflict-aware draft agenda, publication, views, timezone handling, rooms/tracks/settings, and rollback. | Requires first-party session/settings management, agenda eligibility, conflict matrix, five views, advisory AI proposals, versioned private drafts, atomic publication, outbox delivery, and IANA timezone invariants. |
| Distribution and integrations | active | Public embeds/API, Cloudflare/Airtable/OpenSend, Forge, and performance. | Requires public projections, scoped API, privacy-safe CSV/XLSX exports, infrastructure ownership, environment isolation, and release budgets. |

## Established Facts
- Round 0: `kill-my-saas-brief.pdf` is the primary product-scope source; the host transcript and focused public research supplement it.
- Round 0: Skip exhaustive authenticated Sessionboard inspection. GJC creates the PRD directly; Ever remains mandatory for Build and QA.
- Round 0: Extract PDF images and copy valid user-supplied screenshots into `evidence/` with a manifest. Exclude the unrelated browser-failure screenshot.
- Round 0: Build the program-side job to be done, not CRM, marketing, payment, multilingual, sponsor, exhibitor, transcription, or unrelated AI-insights modules.
- Round 1: CFP supports configurable conditional fields, routing, public publishing, and automatic review-queue placement.
- Round 2: The architecture must be production-grade and must not be a Next.js full-stack monolith.
- Round 3: Next.js is frontend-only; the backend API is separately deployed, with Hono on Cloudflare Workers selected as the suitable boundary.
- Round 4: Evidence is PDF + extracted images + user screenshots + host transcript + focused cited research; ignore YouTube.
- Round 5: Use least-privilege participant grants and safe private-asset/public-projection boundaries.
- Round 6: Every competition bonus is mandatory: Cloudflare, Airtable, Forge, performance, and public API.
- Round 7: Airtable is authoritative for business/program records; D1 and Durable Objects own identity, tokens, idempotency, locks, job state, and delivery audit state.
- Round 8: AI may prefill rubric scores and rankings, but only a human-confirmed or edited score counts.
- Round 8: Magic-link/verified-email and password access are required; social OAuth providers are intentionally excluded.
- Round 9: Room and participant overlap are hard scheduling blockers. Track, capacity, travel-time, and custom-rule conflicts are warnings with audited overrides.
- Round 10: Preserve the observed account-first CFP wizard: Welcome → Account → Submission → Participant → Review, followed by confirmation and portal access.
- Round 11: Use OpenSend at `https://opensend.namuh.co` with sending-scoped credentials and `auth@`, `speakers@`, and `calendar@foreverbrowsing.com` sender identities.
- Round 12: Cloudflare production/staging owner is account `7bcb73282d45e4294cc70dd3e2671bfb`; the current token still needs D1 Edit.
- Round 12: Forge repository is `https://forge.smol.ai/jaeyunha/open-sessionboard` with Git URL `https://forge.smol.ai/jaeyunha/open-sessionboard.git`, public visibility, and AGPL-3.0-or-later.
- Round 13: Performance budgets are release gates.
- Round 14 (historical integration decision; superseded for this build): Accelevents was discussed as controlled one-way outbound with preview, explicit publish, idempotent upserts, visible failures, and retries; the user later explicitly disabled it after confirming it is not required by the brief.
- Round 15: CFP rules support nested AND/OR logic, field/section actions, rich routing inputs, preview, and cycle detection.
- Round 16: Speaker tasks support configurable types, owners, due dates, dependencies, reminders, complete workflow states, and audit history.
- Round 17: Focused public research is mandatory whenever primary evidence is vague; citations are required.
- Round 18: OpenSend delivers provider-neutral RFC 5545 REQUEST/UPDATE/CANCEL with stable UID, increasing SEQUENCE, IANA TZID, and room/video details when present.
- Round 19: Agenda uses a private versioned draft, preview/revalidation, atomic immutable publication, outbox delivery, and rollback.
- Round 20: Public widgets support accessible iframe/script modes, JSON/iCal feeds, themes, ≤60-second invalidation, CSP/sandboxing, and no private fields.
- Round 21: Events use canonical IANA timezones, stored instants, event-time defaults, optional viewer-local display, and DST validation.
- Round 22: Submission drafts autosave; submitted records remain editable until close; post-close edits require audited reopening; withdrawal is allowed before final decision; transitions are versioned and idempotent.
- Round 23: The full seeded end-to-end scenario is the mandatory release gate.
- Round 24: Local, staging, and production use isolated data, stateful services, credentials, and delivery behavior; staging uses synthetic data only.

- Host clarification (`discord-messages.md:798-802`): target users are nontechnical event-production professionals. Release validation must prove representative organizer tasks are understandable without code or CLI knowledge; this usability requirement supplements the technical release gates.
## Trigger Metadata
- Round 4 — A direct contradiction, resolved: YouTube was removed from the evidence set and the earlier evidence policy was superseded.
- Round 6 — D scope expansion: every competition bonus became mandatory, temporarily increasing ambiguity from 34.75% to 44.5%.
- Round 10 — A direct contradiction + D scope expansion: direct CFP screenshots replaced the earlier public-before-account assumption with the observed account-first wizard and added detailed behavior. The old access fact was superseded rather than deleted.
- No disputed established fact remains without a `superseded_by` resolution.

## Lateral Review Panel
- Round 1, initial→progress: researcher, contrarian, and simplifier reviewed stack choices. Findings established that the repository’s Next.js defaults were not product-derived and that real speaker identity, storage, communications, and integration boundaries mattered more than hosting shorthand.
- Round 5, pre-auto-answer: the panel recommended per-participant grants, verified claims, private assets, safe public projections, and acceptance-gated tasks. Later direct screenshots superseded only the public-before-account ordering.
- Round 13, progress→refined: the panel identified the calendar lifecycle and Accelevents direction/trigger as the remaining integration gaps; the Accelevents gap is historical and the integration is intentionally excluded from the current build.
- Round 19, pre-auto-answer: all reviewers selected versioned private drafts with preview/revalidation, atomic immutable publication, idempotent outbox effects, and rollback.
- Round 23, refined→ready: researcher and simplifier returned READY. The contrarian’s material new environment-isolation concern produced the Round 24 closure override; all other claims repeated already-resolved gaps.

## Goal
Deliver a production-grade, public, open-source alternative for the Sessionboard program-management workflow, guided by the supplied evidence and focused research, using a separate Next.js frontend and Cloudflare/Hono API, Airtable business authority, Cloudflare operational sidecars, OpenSend communications, Forge source hosting, and complete end-to-end verification.

## Constraints
- Deadline: Wednesday, August 12, 2026 at 10:00 PM PT.
- No Next.js full-stack monolith; frontend and backend are separate deployables.
- Cloudflare account: `7bcb73282d45e4294cc70dd3e2671bfb`.
- Current Cloudflare token must gain D1 Edit before implementation.
- Airtable is the sole writable authority for business/program records; D1 is not a second business database.
- Use R2 private objects for uploads, short-lived authorized access, type/size checks, metadata stripping, and malware scanning.
- Use Better Auth with D1/Drizzle for account/session state; verified email, email/password, and magic-link sign-in are required. Social OAuth providers are intentionally excluded.
- Use OpenSend sending-scoped keys. Calendar delivery is provider-neutral RFC 5545 REQUEST/UPDATE/CANCEL through OpenSend and does not require calendar-provider OAuth.
- All environments are isolated; staging uses synthetic data and suppressed/sandboxed email recipients.
- UI layout, styling, state presentation, and interaction patterns follow PDF and user-supplied Sessionboard screenshots while improving performance and accessibility.
- WCAG 2.1 AA applies to every touched page.
- Never expose evaluator notes, private files, task status, email, or unapproved profile/session data through public widgets or APIs.
- Research-derived details must cite public sources; research cannot expand into excluded modules.
- Ever is required during Build and QA, not for original-product inspection.

## Non-Goals
- CRM and marketing suite.
- SMS messaging and campaigns.
- Payment workflows.
- Multilingual support; English only.
- Pixel-for-pixel reproduction.
- Sponsors, exhibitors, transcriptions, media-AI, SbQL, and unrelated AI insights.
- Microsoft OAuth; it is intentionally not part of this build.
- Direct provider calendar writes or calendar-provider OAuth; OpenSend's provider-neutral RFC 5545 lifecycle remains required.
- Multiple alternative agenda scenarios.
- Accelevents publication or synchronization; it is intentionally not part of this build.
- Shared staging/production data or secrets.

## Competition-relevant workflow expansion

Topology status describes required scope, not delivery status. No workflow below is a completion claim; implementation remains incomplete until its PRD `build_pass` and `qa_pass` gates pass.

The competition-relevant product surface is program operations, not a CRM or marketing suite. The following first-party workflows are explicitly in scope:

- **Organizer event and CFP control plane:** Organizers manage event/session settings, rooms, tracks, tags, formats, statuses, and agenda eligibility from first-party surfaces rather than generic resource CRUD. The default agenda-eligible status is Accepted, with event-scoped, audited changes. CFP authors can create and publish up to 20 forms with sections, built-in and custom fields, conditional questions/routing, validation, and explicit file-request fields. A field may be event-local or tenant-reusable; reusable definitions expose references and impact and are versioned so changing a definition never silently reinterprets submitted answers. Sources: https://learn.sessionboard.com/get-started/overview, https://learn.sessionboard.com/videos/overview, https://learn.sessionboard.com/sessions/agenda, https://learn.sessionboard.com/sessions/submission-forms.
- **Participant portal workspace:** An authenticated account receives a server-derived list of authorized event portals and can switch between them from an account-menu control; a query parameter can preserve selection but never grants access. Within the selected event, the portal supports draft autosave/resume, pre-close submission editing and audited post-close reopen, co-speaker roster add/edit/remove with explicit capabilities, profile updates, session files and file requests, allowed type/version selection, immutable file history, comments, authorized downloads, validated form tasks, task feedback/reopen, published wiki/resources, and stale-context clearing when switching events. Sources: https://learn.sessionboard.com/participants/overview, https://learn.sessionboard.com/participants/edit-submission, https://learn.sessionboard.com/participants/how-to-add-of-edit-speaker-information-for-an-accepted-session, https://learn.sessionboard.com/participants/upload-files, https://learn.sessionboard.com/participants/updated-portals.
- **Evaluation authoring and human authority:** Organizers author evaluation plans, rounds, rubrics, assignments, blind-review settings, evaluator-visible session/speaker fields, and optional authorized uploaded-file projections. A plan's grading configuration is locked or versioned when it opens or receives scores, and historical scores retain their exact plan/rubric revision. AI evaluation output is advisory only: it is a pending, event/evaluator/submission-scoped suggestion with cited evidence, never a counted score, rank, decision, message, export value, or public value until an authorized human explicitly accepts, edits, or rejects it. Stale or invalidated suggestions remain excluded server-side. Sources: https://learn.sessionboard.com/evaluations/evaluation-plans, https://learn.sessionboard.com/videos/video-ai-evaluations.
- **Decisions and event communications:** Authorized organizers record human accept, waitlist, or reject outcomes. Each outcome projects to the participant portal and can enqueue an auditable, idempotent message. Transactional templates cover account verification, submission confirmation, reminders, decisions, tasks, schedule publication, updates, and cancellation. Separately, an organizer can compose an event-scoped message to an explicitly selected participant group, preview the approved template version and recipient count, snapshot recipients, send through OpenSend, and inspect per-recipient delivery/history; this is operational event email, not SMS, CRM, or marketing automation. Source: https://learn.sessionboard.com/get-started/overview and https://learn.sessionboard.com/videos/overview.
- **Reports and grade exports:** Organizers save, name, describe, edit, delete, and run program-scoped report definitions over allowlisted sessions, participants/speakers, and evaluation-plan progress. Definitions select permitted relationships, fields, order, filters, and ascending/descending sorting. Runs produce audited CSV or XLSX downloads with spreadsheet-safe serialization and authorization checks; evaluation plans additionally provide reproducible individual and cumulative grade exports from a selected plan version without exposing blind-review notes, private files, or unauthorized personal data. Sources: https://learn.sessionboard.com/videos/video-reports and https://learn.sessionboard.com/evaluations/evaluation-plans.
- **Advisory AI agenda and content remix:** An AI agenda run snapshots organizer-selected dates, eligible statuses, rooms, day windows, ordered rules, base agenda revision, and ignore-existing-times/rooms choice, then creates a private proposed schedule and human-readable diff. Organizers may reject, regenerate, or selectively accept changes; deterministic conflict validation, current-revision checks, and atomic publication remain authoritative, and AI never publishes or overrides hard conflicts. An AI content-remix run may propose revisions for selected session titles/descriptions, optional existing tags/tracks, or speaker bios with bounded tone/guidance; organizers compare original and candidate, regenerate, and explicitly save each accepted candidate as an auditable revision. Unconfirmed candidates never enter public projections, exports, or automated communications. Sources: https://learn.sessionboard.com/videos/video-ai-agenda-builder, https://learn.sessionboard.com/videos/video-ai-content-remix, https://learn.sessionboard.com/sessions/agenda.
- **Verified identity:** Account identity changes are separate from event-scoped profile edits. Changing an email or username requires reauthentication and verification of the new address, preserves grants by stable account ID, prevents duplicate verified identities, and exposes pending, failed, and completed states. Event display-name and profile changes remain separately authorized and versioned. Source: https://learn.sessionboard.com/participants/overview.

AI is advisory everywhere in this product. Model output may create private candidates or suggestions only; a human must apply, accept, edit, or reject every consequential change before it can affect scores, rankings, decisions, schedule records, content revisions, messages, exports, or public projections.
### Expanded acceptance criteria

- [ ] Dynamic CFP forms render the published schema (including custom fields, conditional sections/routing, validation, and file requests) in the first-party public and organizer surfaces; reusable tenant fields expose references/impact and immutable answer/schema versions.
- [ ] First-party organizer surfaces create and edit event/session settings, rooms, tracks, and agenda-eligible statuses; Accepted is the default and settings changes are tenant/event-scoped and audited.
- [ ] Portal context discovery returns only authorized event/role contexts; switching clears prior-event data and revalidates every read and mutation.
- [ ] Portal drafts autosave with visible state and optimistic-concurrency recovery; eligible submissions expose edit until close, audited reopen restores edit after close, and co-speaker roster changes use explicit capabilities.
- [ ] The portal Files workspace supports request type, upload/finalization state, immutable version history, comments, and fresh authorized downloads; task completion is blocked until required file finalization succeeds.
- [ ] Portal form tasks render organizer-configured fields with server validation, preserve response history, and support needs-changes/reopen; published wiki/resources are event-scoped and read-only to participants.
- [ ] Evaluation authoring supports plan/round/rubric/assignment configuration, evaluator-visible field/file projections, and locked or versioned grading configuration; historical results retain their plan revision.
- [ ] Pending AI evaluation suggestions carry rubric/submission revisions and evidence, are excluded from all aggregates and downstream surfaces, and require per-suggestion human accept/edit/reject with audit history.
- [ ] Accept, waitlist, and reject decisions update participant-visible state and use versioned/idempotent template-backed delivery with recipient and delivery audit.
- [ ] Organizer event email supports explicit recipient groups, template preview/version, recipient snapshot, idempotency, per-recipient delivery state, and send history; SMS, CRM, and marketing automation remain excluded.
- [ ] Report definitions/runs are program-only, allowlisted, access-checked at definition and run time, auditable, and export CSV/XLSX safely; grade exports support reproducible individual and cumulative output for a selected evaluation-plan version.
- [ ] Advisory AI agenda runs and content-remix runs remain private candidates until explicit human application; every commit reruns deterministic authorization/conflict/current-revision validation and cannot auto-publish or override hard blockers.
- [ ] Verified email/profile identity changes require reauthentication/new-address verification, preserve event grants by stable account ID, and expose clear pending/failure/completion states.

### Competition evidence sources

- Organizer overview and capability index: https://learn.sessionboard.com/get-started/overview and https://learn.sessionboard.com/videos/overview
- Forms, fields, and file requests: https://learn.sessionboard.com/sessions/submission-forms
- Agenda and rooms/settings: https://learn.sessionboard.com/sessions/agenda
- Evaluation plans and grade exports: https://learn.sessionboard.com/evaluations/evaluation-plans
- Participant portal, editing, speakers, files, and portal switching: https://learn.sessionboard.com/participants/overview, https://learn.sessionboard.com/participants/edit-submission, https://learn.sessionboard.com/participants/how-to-add-of-edit-speaker-information-for-an-accepted-session, https://learn.sessionboard.com/participants/upload-files, https://learn.sessionboard.com/participants/updated-portals
- Reports, advisory agenda, and content remix: https://learn.sessionboard.com/videos/video-reports, https://learn.sessionboard.com/videos/video-ai-agenda-builder, https://learn.sessionboard.com/videos/video-ai-content-remix
- AI evaluation walkthrough (feature existence only; human-confirmation policy is repository intent): https://learn.sessionboard.com/videos/video-ai-evaluations

These sources clarify competition-relevant workflows only; they do not add CRM, marketing automation, SMS, payment, multilingual, Microsoft OAuth, or Accelevents scope.

## Acceptance Criteria
### Evidence and onboarding
- [ ] Extract every relevant image from `kill-my-saas-brief.pdf` into `evidence/` with a manifest containing source page, label, component, and expected UI state.
- [ ] Copy the valid files from `cfp-page-submission-process-screenshots/` into the reference corpus; exclude the unrelated browser failure screenshot.
- [ ] Generate a detailed `prd.json` from this spec and evidence without running the normal Inspect loop.
- [ ] Keep Ever configured for Build and QA visual/functional verification.

### Submission intake
- [ ] Organizer creates up to 20 event submission forms with Welcome, Account, Submission, Participant, and Review behavior reflected by the evidence.
- [ ] Required built-in speaker fields include first name, last name, and email; form settings include close date, reminders, admin notifications, speaker limit up to 15, submission limits, confirmation, redirect, and success content.
- [ ] Nested AND/OR conditions show, hide, require, or skip fields/sections and cannot form cycles.
- [ ] Rules route by format, tag, track, category, or answers and can be previewed before publication.
- [ ] Drafts autosave and resume; submit/edit/reopen/withdraw transitions are versioned and idempotent.
- [ ] Submitted records remain editable until close; only an audited organizer reopen permits later changes; withdrawal is allowed before final decision.
- [ ] Account/password validation, terms consent, required-field feedback, rich text, searchable selects, submission limits, multi-participant entry, secondary contacts, review/edit, confirmation, and portal redirect match supplied states.

### Speaker operations
- [ ] Event-scoped authorization covers organizer, reviewer, submitter, participant/speaker, secondary contact, and API client.
- [ ] Negative tests prove cross-user and cross-event data, profile, task, review, and asset access is denied.
- [ ] Speakers manage only their authorized biography, headshot, slides, and supporting files.
- [ ] Acceptance assigns configurable form/upload/action tasks with owners, due dates, dependencies, and reminders.
- [ ] Task states include not started, in progress, submitted, needs changes, completed, waived, overdue, and reopened; every transition is audited.
- [ ] Organizer dashboard updates outstanding-task state in real time.

### Review and communications
- [ ] Evaluation plans support assignments, multiple rounds, rubrics, optional blind review, comments, autosave, close dates, progress, and conflict-of-interest abstention.
- [ ] AI may prefill scores/rankings with cited rubric evidence, but no score counts until a human confirms or edits it.
- [ ] OpenSend uses `auth@foreverbrowsing.com`, `speakers@foreverbrowsing.com`, and `calendar@foreverbrowsing.com` with verified SPF, DKIM, and DMARC.
- [ ] Templates cover account verification, submission confirmation, reminders, review decisions, tasks, schedule publication, updates, and cancellation.
- [ ] OpenSend delivers provider-neutral RFC 5545 REQUEST/UPDATE/CANCEL messages with stable UID, increasing SEQUENCE, IANA TZID, correct room/time, and room/video details when present; Gmail, Outlook, Apple Calendar, and generic iCal clients update one event without duplication.
- [ ] Delivery, bounce, complaint, and webhook state is observable and retryable.

### Program scheduling
- [ ] Accepted sessions can be dragged in list, day, week, month, and rooms views.
- [ ] Same-room and same-participant overlaps are hard blockers.
- [ ] Track, capacity, travel-time, and custom-rule conflicts are warnings with reasoned, audited override.
- [ ] Each event has an IANA timezone; DST-invalid times are rejected; event-time display is default and viewer-local display is optional.
- [ ] Organizers edit one private versioned draft, preview diffs and conflicts, and atomically publish an immutable revision.
- [ ] Public surfaces never read draft state.
- [ ] Publication creates an idempotent outbox for embeds, calendar updates, and cache invalidation.
- [ ] Rollback restores a prior revision and sends corrective downstream updates.

### Distribution, API, and integrations
- [ ] Public speaker-gallery and agenda widgets support responsive accessible iframe and script modes, safe theme controls, CSP/sandboxing, and no private fields.
- [ ] JSON and iCal feeds resolve the current published revision and invalidate within 60 seconds.
- [ ] Public API has OpenAPI documentation, versioned routes, scoped API tokens, pagination, filtering, sorting, stable errors, rate limits, optimistic concurrency, bulk operations, and signed retryable webhooks.
- [ ] API scope includes events, forms/fields, submissions, participants/speakers, reviews/plans/rubrics, tasks, agenda drafts/revisions/rules, rooms/tracks/tags/formats/statuses, files, embeds, publications, and integration status.
- [ ] API excludes CRM, sponsors, exhibitors, transcriptions, and unrelated AI-insights surfaces.

### Platform, performance, and delivery
- [ ] Next.js frontend and Hono/Cloudflare Workers API are independent deployables with explicit same-parent-domain cookie/CORS policy.
- [ ] Airtable owns event/program records; D1/Durable Objects own auth, tokens, idempotency, locks, queues/job coordination, and audit/outbox state only.
- [ ] D1 token permission is fixed before provisioning.
- [ ] Local, staging, and production have separate Airtable, D1, R2, Queues, Durable Objects, secrets, API keys, and OpenSend behavior; staging uses synthetic data.
- [ ] Remove all legacy orchestration, obsolete template guidance, and dangling references after dependency analysis.
- [ ] Retain only source, ordinary Make targets, tests, schemas, evidence, final spec/PRD/architecture, Ever and `codex-cua` guidance, and deployment tooling.
- [ ] Make Forge private before any project push.
- [ ] Delete inherited template Git history after cleanup, initialize `main`, and create exactly one clean root baseline commit before implementation commits.
- [ ] Use `https://forge.smol.ai/jaeyunha/open-sessionboard.git` as the sole remote; do not retain GitHub.
- [ ] Keep Forge private until the mandatory release gate passes, then make it public for submission.
- [ ] Rewrite `README.md` exclusively for Open Sessionboard with product, architecture, setup, commands, isolated environments, testing, Ever/`codex-cua`, deployment, API/docs, evidence, Forge workflow, license, and submission guidance.
- [ ] Public LCP ≤1.5 seconds p75, INP ≤200 ms, CLS ≤0.1.
- [ ] Cached API reads ≤300 ms p95, ordinary writes ≤1 second p95, and Airtable workflows ≤2 seconds p95.
- [ ] Error rate, webhook delivery, queues, outbox lag, Airtable retries, and external integration failures are monitored.

### Mandatory end-to-end release gate
- [ ] A seeded event proves: conditional CFP creation and publication → account and draft → multi-participant submission → routing → multi-round human-authoritative AI-assisted review → acceptance → speaker tasks/files/forms → conflict-checked private agenda → immutable publication → OpenSend email and updateable calendar event → public widgets/API.
- [ ] Ever and the `codex-cua` skill verify the complete flow against supplied screenshots with real browser/GUI interactions during implementation and QA.
- [ ] Representative event-production professionals can complete representative organizer tasks and explain the outcomes without code or CLI knowledge; this usability evidence supplements, and does not replace, Ever, `codex-cua`, and automated technical gates.
- [ ] Unit, API-contract, security, accessibility, performance, and E2E tests pass without weakened assertions.
- [ ] Production URL, Forge repository, source license, demo accounts, and evaluator walkthrough are ready before the competition deadline.

## Final Delivery Workflow Amendment
- Round 25 added repository cleanup as a mandatory outcome.
- Round 26 superseded the minimal legacy-loop idea: remove legacy orchestration entirely and use GJC-native workflows only.
- Round 27 fixed repository bootstrap: private Forge during development, no inherited template history, one clean root baseline commit, Forge as sole origin, public only at submission.
- Round 28 requires the `codex-cua` skill for real GUI interaction checks alongside Ever and automated tests.
- Round 29 requires `README.md` to document Open Sessionboard exclusively and contain no legacy template instructions.
- Approved execution path: deep-interview spec → ralplan consensus → separate explicit execution approval → GJC-native implementation and verification.
- These requirements supersede any earlier reference to retaining a legacy Build/QA loop.

### Additional Acceptance Criteria
- [ ] No legacy inspect/build/QA/watchdog/onboarding/agent-runner orchestration remains.
- [ ] No retained file references removed removed legacy commands or paths.
- [ ] Repository visibility is private before the clean baseline push.
- [ ] Exactly one root baseline commit precedes product implementation commits.
- [ ] `sf repo get jaeyunha/open-sessionboard` confirms private development visibility; submission procedure changes it to public only after release gates pass.
- [ ] `codex-cua` checks use `cua status`, attach to the exact application window, exercise click/type/scroll/drag paths, and retain screenshot/assertion evidence.
- [ ] `README.md` accurately documents the delivered product and GJC-native workflow.

## Deferrals
- No active topology component is deferred.
- Microsoft OAuth and Accelevents are intentionally excluded from this build, not deferred. Direct provider calendar writes remain out of scope; OpenSend provider-neutral delivery is required.
- Multiple parallel agenda scenarios are deferred.
- Convergence pacing: no minimum-round floor, score-drop cap, or confidence dampening was used; bidirectional scoring was the pacing mechanism.

## Assumptions Exposed & Resolved
| Assumption | Challenge | Resolution |
|------------|-----------|------------|
| Existing template defaults were a valid stack | They were template defaults, not product-derived. | Separate Next.js frontend and Hono/Cloudflare API; Airtable authority with Cloudflare sidecars. |
| Public CFP meant submit-before-account | Direct screenshots showed Account as step 2 before Submission. | Preserve the account-first five-step wizard while keeping per-participant least privilege. |
| Calendar support required Google/Microsoft OAuth (historical assumption) | Email and calendar identity are separate. | Provider-neutral RFC 5545 through OpenSend; no calendar-provider OAuth is required. |
| Airtable alone could safely own all state | Auth, locks, idempotency, and outbox semantics require transactional operational state. | Airtable owns business records; D1/Durable Objects own named operational state only. |
| Agenda edits could be live | Live edits would leak drafts and spam external systems. | Versioned private draft with atomic immutable publication and rollback. |
| Accelevents “one-way” was self-explanatory (historical assumption) | Direction, records, and trigger were absent. | The user later explicitly disabled Accelevents after confirming it was not required by the brief; it is intentionally excluded from current scope. |
| Optional competition bonuses could be deferred | User required all bonus points. | Cloudflare, Airtable, Forge, performance, and API are mandatory. |
| Staging could reuse production resources | Private data and side effects would leak. | Fully isolated environments with synthetic staging data. |

## Technical Context
### Previous template repository
- The previous onboarding script collected generic template choices that were not product-derived and has been removed.
- This run uses GJC for onboarding/PRD production.
- The normal Inspect loop is skipped. Evidence extraction and research must create the inputs normally consumed from `prd.json`, `target-docs/`, and `evidence/`.
- Ever remains required by Build and QA.
- GJC-native workflows are the only supported planning, implementation, QA, and deployment path; no legacy orchestration remains.
- After cleanup, inherited template Git history is replaced by one clean root baseline commit on `main`.
- Forge is the sole origin and remains private until submission.
- `README.md` is rewritten for Open Sessionboard and contains no legacy template guidance.
- Ever and the `codex-cua` skill are mandatory interaction-verification surfaces.

### Selected architecture
- Frontend: Next.js, frontend-only, separately deployed on Cloudflare.
- API: Hono on Cloudflare Workers.
- Auth: Better Auth on Hono, D1 via Drizzle SQLite adapter, email/password, magic links, and verified-email flows.
- Business authority: Airtable.
- Operational state: D1 + Durable Objects.
- Files: private R2.
- Async: Cloudflare Queues plus durable outbox/audit state.
- Email/calendar: OpenSend (`https://opensend.namuh.co`).
- Source hosting: Forge `jaeyunha/open-sessionboard`, AGPL-3.0-or-later.
- Production account: Cloudflare `7bcb73282d45e4294cc70dd3e2671bfb`.

### Research sources
- Sessionboard submission forms: https://learn.sessionboard.com/sessions/submission-forms
- Sessionboard evaluator workflow: https://learn.sessionboard.com/evaluations/evaluators-how-to-evaluate-sessions
- Sessionboard agenda: https://learn.sessionboard.com/sessions/agenda
- Sessionboard API introduction: https://apidocs.sessionboard.com/introduction
- Sessionboard authentication: https://apidocs.sessionboard.com/authentication
- Sessionboard integrations: https://apidocs.sessionboard.com/integrations
- Sessionboard webhooks: https://apidocs.sessionboard.com/webhooks
- Historical research reference (not a current dependency): Accelevents Sessionboard integration: https://support.accelevents.com/en/articles/9049978-sessionboard-integration
- Better Auth Hono integration: https://better-auth.com/docs/integrations/hono
- Better Auth Drizzle adapter: https://better-auth.com/llms.txt/docs/adapters/drizzle.md

## Ontology (Key Entities)
The target ontology includes the stable entities below; these are requirement boundaries, not claims that the corresponding implementation is complete.

| Entity group | Type | Representative fields | Relationships |
|--------------|------|-----------------------|---------------|
| Event, Organizer, Account | core domain | event timezone, identity, roles | Event owns forms, reviews, tasks, agenda, integrations. |
| SubmissionForm, Field, ConditionGroup, FormRule, ReviewRouting | core domain | settings, questions, conditions, actions | Forms create versioned submissions and route them to review queues. |
| Submission, SubmissionDraft, SubmissionVersion, SubmissionParticipant, SecondaryContact | core domain | status, answers, version, role, grants | Account owns drafts; participants retain individual profile/task authority. |
| SpeakerProfile, Asset, TaskAssignment, TaskDependency, TaskTransition | core domain | bio, files, task states, deadlines | Accepted participants receive tasks and private asset access. |
| TenantFieldDefinition, FieldSchemaVersion, TaskForm, TaskResponse | core domain | reusable field scope, impact, response version, validation | Tenant reuse cannot mutate stored answers; portal form-task responses remain owner-scoped and auditable. |
| PortalContext, WikiPage, PortalResource | core domain | event context, publication, ordering, visibility | Switcher and resources are server-derived and event-scoped. |
| AssetVersion, AssetComment, UploadCapability, DownloadCapability | core domain | version family, scan/finalization, comment, expiry | Files are private, immutable by version, and downloaded only through fresh authorization. |
| EvaluationPlan, ReviewRound, Rubric, Score, AISuggestion, BlindReview, ConflictAbstention | core domain | rounds, criteria, score, evidence | Humans confirm all counted scores. |
| EvaluationPlanVersion, EvaluationProjection, ReportDefinition, ReportRun | core domain | locked rubric, visible fields/files, filters, export format | Historical scores and reports use reproducible plan/configuration snapshots. |
| Session, Agenda, AgendaDraft, PublishedAgendaRevision, EventRule | core domain | schedule, revision, rules | Accepted sessions enter private drafts and immutable publications. |
| MessageTemplate, RecipientSnapshot, DeliveryAudit | core domain | template version, selected audience, per-recipient state | Event messages are idempotent, auditable, and separate from CRM/marketing. |
| HardConflict, SoftWarning, ScheduleOverride, ZonedScheduleTime | core domain | overlaps, warning type, reason, zone | Conflicts and time invariants gate publication. |
| AgendaSuggestionRun, ContentRemixCandidate, ContentRevision, IdentityVerification | core domain | criteria snapshot, candidate provenance, human application, verification state | AI candidates are advisory/private; identity changes require verified email and stable account grants. |
| SenderIdentity, EmailMessage, CalendarInvitation, CalendarDeliveryState | core domain | template, UID, SEQUENCE, method | OpenSend delivers workflow and calendar messages. |
| PublicProjection, PublicWidget, EmbedFeed, ApiToken, WebhookSubscription | core domain | published fields, theme, scope, events | Public/API surfaces expose only approved revision data. |
| AirtableBase, OperationalState, AuditDelivery, PublicationOutbox | system boundary | records, locks, attempts | Airtable owns business data; Cloudflare owns operational coordination. |
| DeploymentEnvironment, EnvironmentBoundary, PerformanceBudget, ReleaseScenario | supporting | resources, isolation, thresholds | Deployment and release evidence are explicit gates. |

## Ontology Convergence
| Round | Entity Count | New | Changed | Stable | Stability Ratio |
|-------|-------------|-----|---------|--------|----------------|
| 1 | 7 | 7 | - | - | - |
| 2 | 7 | 0 | 0 | 7 | 100% |
| 3 | 14 | 7 | 0 | 7 | 53.8% |
| 4 | 14 | 0 | 0 | 14 | 100% |
| 5 | 20 | 6 | 0 | 14 | 70.0% |
| 6 | 27 | 7 | 0 | 20 | 74.1% |
| 7 | 29 | 2 | 0 | 27 | 93.1% |
| 8 | 33 | 4 | 0 | 29 | 87.9% |
| 9 | 36 | 3 | 0 | 33 | 91.7% |
| 10 | 39 | 3 | 0 | 36 | 92.3% |
| 11 | 42 | 3 | 0 | 39 | 92.9% |
| 12 | 43 | 1 | 0 | 42 | 97.7% |
| 13 | 44 | 1 | 0 | 43 | 97.7% |
| 14 | 47 | 3 | 0 | 44 | 93.6% |
| 15 | 50 | 3 | 0 | 47 | 94.0% |
| 16 | 52 | 2 | 0 | 50 | 96.2% |
| 17 | 55 | 3 | 0 | 52 | 94.5% |
| 18 | 56 | 1 | 0 | 55 | 98.2% |
| 19 | 58 | 2 | 0 | 56 | 96.6% |
| 20 | 60 | 2 | 0 | 58 | 96.7% |
| 21 | 61 | 1 | 0 | 60 | 98.4% |
| 22 | 62 | 1 | 0 | 61 | 98.4% |
| 23 | 63 | 1 | 0 | 62 | 98.4% |
| 24 | 64 | 1 | 0 | 63 | 98.4% |
| 25 | 65 | 1 | 0 | 64 | 98.5% |
| 26 | 66 | 1 | 0 | 65 | 98.5% |
| 27 | 67 | 1 | 0 | 66 | 98.5% |
| 28 | 68 | 1 | 0 | 67 | 98.5% |
| 29 | 69 | 1 | 0 | 68 | 98.5% |

## Interview Transcript
<details>
<summary>Full Q&A summary (29 rounds)</summary>

1. **Submission lifecycle:** Full configurable form, conditional logic, routing, public publishing, and review-queue placement. Ambiguity 51.5%.
2. **Architecture posture:** Reject Next.js monolith and demo-only defaults; require justified production architecture. Ambiguity 50.5%.
3. **Architecture/evidence boundary:** Next.js frontend, separate API, skip inaccessible interactive inspection, use evidence-driven detailed PRD. Ambiguity 38%.
4. **Evidence correction:** PDF + transcript + focused research; ignore YouTube. Ambiguity 36.75%.
5. **Speaker access/design:** Evidence-driven lifecycle, no feature downgrades, supplied Sessionboard UI as visual reference; panel selected safe participant grants. Ambiguity 34.75%.
6. **Competition bonuses:** Cloudflare, Airtable, Forge, performance, and API all mandatory. Ambiguity rose to 44.5% due scope expansion.
7. **Airtable authority:** Business records in Airtable; identity/idempotency/jobs/audit in Cloudflare sidecars. Ambiguity 36.75%.
8. **AI review:** AI prefills; human confirmation is mandatory. Ambiguity 36.75%.
9. **Schedule conflicts:** Room/participant hard blocks; other rules warn with audited overrides. Ambiguity 34.75%.
10. **CFP screenshots/Ever:** Preserve account-first five-step wizard; supplied screenshots are authoritative; Ever is Build/QA-only. Ambiguity rose to 39.25% while new screenshot requirements were incorporated.
11. **OpenSend identities:** Separate auth@, speakers@, and calendar@ senders. Ambiguity 32.7%.
12. **Cloudflare account:** Use Ashleyha account `7bcb...`; Forge repository confirmed. Ambiguity 30.25%.
13. **Performance:** Strict browser and API percentile budgets. Ambiguity 27%.
14. **Accelevents (historical, later explicitly disabled):** Controlled outbound preview/publish with idempotent upserts was discussed, but it is not part of the current build. Ambiguity 27%.
15. **CFP rules:** Nested production-grade conditions/routing with preview and cycle validation. Ambiguity 18.25%.
16. **Speaker tasks:** Comprehensive audited workflow with owners, deadlines, dependencies, and reminders. Ambiguity 17.5%.
17. **Research policy:** Focused cited Sessionboard research fills vague evidence without expanding scope. Ambiguity 16.25%.
18. **Calendar:** Provider-neutral RFC 5545 lifecycle through OpenSend. Ambiguity 16%.
19. **Agenda publication:** Architect-assisted versioned private draft, atomic immutable publish, outbox, rollback. Ambiguity 13.9%.
20. **Public embeds:** Accessible iframe/script widgets, JSON/iCal, themes, privacy, ≤60-second invalidation. Ambiguity 11.45%.
21. **Timezone:** Canonical IANA event zone, instant storage, DST validation, TZID serialization. Ambiguity 8.85%.
22. **Submission states:** Autosaved drafts, editable-until-close, audited reopen, withdrawal, versioning/idempotency. Ambiguity 5.6%.
23. **Release gate:** Full seeded cross-component golden path is mandatory. Ambiguity 3.9%.
24. **Environment isolation:** Separate resources, secrets, and side effects; synthetic staging data. Ambiguity 2.5%.
25. **Repository cleanup:** Remove obsolete template material and retain only required engineering assets. Ambiguity 4.55%.
26. **Execution model:** GJC-native only; remove legacy orchestration. Ambiguity 3.3%.
27. **Repository bootstrap:** Private Forge, no inherited history, one clean root baseline commit, sole Forge origin, public only at submission. Ambiguity 2.5%.
28. **Interaction verification:** Require `codex-cua` alongside Ever and automated tests. Ambiguity 2.0%.
29. **Project documentation:** Rewrite `README.md` exclusively for Open Sessionboard. Ambiguity 1.8%.

</details>
