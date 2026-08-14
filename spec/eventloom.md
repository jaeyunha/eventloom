# Eventloom product contract

This document is the current product contract for Eventloom. It describes the supported program-operations product, its system boundaries, and the evidence-backed implementation status. It is intentionally concise; executable code and deployment configuration remain the authority for details that are not stated here.

## Source hierarchy and status vocabulary

Use sources in this order when they disagree:

1. Executable code, configuration, and an observed deployment define what currently runs.
2. This document defines the supported product contract and records status.
3. `ARCHITECTURE.md` defines the system boundaries and ownership of state.
4. Operational documents define executable setup, QA, deployment, and release procedures.
5. `docs/llm-judge-runs.md` records evaluator evidence and its limitations.
6. Cited product evidence and focused research explain the intended workflow, but do not turn an unverified behavior into a release claim.

Status labels have precise meanings:

- **source-present** — a contract, implementation source, or evidence exists. This is not release verification.
- **partial** — some implementation or evidence exists, but a required path, integration check, or release condition is incomplete.
- **release-verified** — only a complete clean post-reset release run and the required real-world checks may use this label. No area currently has this status.
- **pending** — required configuration or external verification has not yet been completed.
- **unsupported** — intentionally outside the runtime contract; it must not be treated as a missing release check.

## Goals

Eventloom serves nontechnical event-production professionals who need one coherent path from call for papers (CFP) through speaker operations, human-authoritative review, communications, agenda publication, and public distribution. The product should be understandable through the browser, tenant-safe by construction, auditable when it changes consequential state, and efficient enough for real program work.

The built-in Speaker CRM is part of the supported first-party product. It is an organizer-facing, organization-scoped contact workspace connected to program operations; it is not an external CRM synchronization promise.

## Supported surfaces and behavior

### Organizer administration

Organizers manage event and session settings, rooms, tracks, tags, formats, statuses, agenda eligibility, CFP forms, submissions, participants, speaker profiles, review plans, tasks, deliverables, communications, reports, integrations, and publication history. Settings and records are event- and organization-scoped and retain the versions or audit entries needed to explain consequential changes.

### CFP and submission intake

A published CFP can contain sections, built-in and tenant-reusable fields, custom field types, validation, file requests, conditional show/hide/require rules, routing, close dates, reminders, and per-account submission limits. The account-first flow is Welcome → Account → Submission → Participant → Review. An account can own multiple distinct proposals up to the configured limit for that CFP form. Each proposal transitions from draft to submitted once; autosave, ordinary edits, and audited reopen changes create versions of that same proposal without consuming another slot. Applicants can add participants and secondary contacts, edit until close, request an audited organizer reopen after close, and withdraw before a final decision. Form and answer versions prevent a changed reusable field from reinterpreting stored answers.

### Speaker portal and deliverables

An authenticated account receives only the event portal contexts granted by the server and can switch among those contexts without carrying stale data across events. A participant can manage only authorized profile and submission information, co-speakers, task forms, private files, comments, and downloads. Organizer-assigned tasks have owners, due dates, dependencies, reminders, and auditable lifecycle states. File requests enforce allowed types and size, private upload/finalization and scanning, immutable versions, review feedback, and expiring authorized downloads. Organizer deliverables views and bounded ZIP exports expose only currently authorized assets.

### Review, decisions, and communications

Organizers author evaluation plans, rounds, rubrics, assignments, evaluator-visible projections, blind-review settings, and conflict-of-interest abstention. Reviewers save comments and rubric values within their grants. Accept, waitlist, and reject decisions are human actions and project to the portal and to versioned, idempotent communications. Event-scoped messages require an explicit recipient group, a previewed template version, a recipient snapshot, delivery state, and send history.

### Agenda and publication

Accepted sessions are scheduled in a private, versioned draft with event-scoped IANA timezone data. Room and participant overlaps are hard blockers. Track, capacity, travel-time, and custom-rule conflicts are warnings that require an audited override. Nonexistent local times are rejected and ambiguous times require an explicit choice. Preview and current-revision checks precede atomic publication of an immutable agenda revision; public projections never read draft state. Publication and rollback enqueue idempotent downstream work for embeds, cache invalidation, webhooks, and calendar delivery.

### Public distribution and API

Public speaker galleries, agenda/itinerary views, JSON and iCal feeds, and iframe/script embeds read only explicitly published, privacy-safe projections. They do not expose drafts, private files, evaluator notes, task status, email addresses, or unapproved profile/session fields. The versioned API provides organization-scoped bearer keys, least-privilege scopes, stable cursor pagination, filtering/sorting, idempotency for retryable writes, optimistic concurrency, stable error envelopes, rate limits, bulk operations where defined, and signed retryable webhooks. The checked-in OpenAPI contract and `/api/v1/openapi.json` describe the mounted API; neither grants access by itself.

### Built-in Speaker CRM

The first-party CRM is supported for organizer memberships only and is organization-scoped. Its bounded scope includes contact records, search and filters, CSV/row import, tags and custom fields, segments, pipeline stages, notes and program history, duplicate detection, explicit merges with optimistic concurrency and idempotency, and bulk outreach through the shared communications boundary with preview and delivery history. CRM records never authorize access to another tenant, private speaker files, reviewer notes, or unpublished agenda data. External CRM synchronization, general marketing automation, and SMS are not part of this contract.

### Reports and advisory AI

Organizers can define and run allowlisted, program-scoped reports and download audited CSV/XLSX output, including reproducible individual or cumulative grade exports for a selected evaluation-plan version. Advisory AI may propose evaluation assistance, agenda placements, or bounded content-remix candidates. Every candidate is private, typed, provenance-labeled, and revision-scoped until an authorized human accepts, edits, or rejects it; unconfirmed output cannot affect scores, ranks, decisions, schedule records, messages, exports, or public projections.

AI is not seed infrastructure. Provisioning personas and seeding fixtures create ordinary accounts and program records; a provider runs only when an authorized user requests an agenda, evaluation, or remix proposal.

## Architecture constraints

- Next.js is the browser frontend only. Hono on Cloudflare Workers is the separately deployed application API. The frontend has no Airtable, D1, R2, queue, or provider credentials.
- Cloudflare D1 (via Better Auth/Drizzle) is authoritative for organization, event, CFP, submission, participant, review, session, agenda, CRM, report, account/session, API-key, idempotency, audit, outbox, publication, and integration state. Durable Objects coordinate tenant/event concurrency but do not replace D1 authority. R2 stores private uploads and export artifacts.
- Airtable is an optional organization-scoped adapter. D1 projects mapped records asynchronously by stable `Application ID`; allowlisted inbound fields are translated into audited, version-checked D1 domain commands. Provider record IDs remain integration details.
- Integrations are explicit adapters. External effects are queued, idempotent, observable, retryable, and auditable. Deterministic mocks/fakes validate contracts only; they are not deployment evidence. AI provider availability is feature-specific and is not an application boot or ordinary seed/provision prerequisite.
- Local, staging, and production use separate D1 databases, R2 buckets, queues, secrets, API keys, and delivery behavior. Optional Airtable connections also use isolated bases and credentials. Staging uses synthetic data and suppressed or sandboxed recipients.
- Public performance targets are LCP ≤1.5 s p75, INP ≤200 ms, CLS ≤0.1; cached API reads target ≤300 ms p95, ordinary writes ≤1 s p95, and Airtable workflows ≤2 s p95. These are release criteria, not current claims.

## Advisory AI provider contract

The repository runtime contract selects OpenAI Responses (`openai-responses`) for all advisory AI features in local, staging, and production. Agenda and evaluation use `gpt-5.6-sol` with medium reasoning; content remix uses `gpt-5.6-terra` with low reasoning. These are explicit quality-first defaults, independently configurable through `OPENAI_*_MODEL` and `OPENAI_*_REASONING_EFFORT`. `gpt-5.6-luna` remains a benchmark candidate for high-volume work rather than an assumed quality-equivalent replacement. Configuration uses a backend-only `OPENAI_API_KEY`; each deployed environment requires an isolated provider-managed secret. The key must never enter `NEXT_PUBLIC_*`, Wrangler variables, browser evidence, logs, API responses, or committed files.

The provider boundary is typed and feature-specific:

- Agenda receives the event and base draft/revision version, selected rooms, day/time windows, ordered rules, eligible session titles and scheduling fields, and existing agenda entries.
- Evaluation receives the selected rubric plus the submission title, abstract, and answers visible under the reviewer's projection; blind or private fields are excluded.
- Remix receives only organizer-selected content fields and guidance/tone; unselected source fields are excluded.

The OpenAI adapter uses the official `POST /v1/responses` REST shape, requests JSON mode under `text.format`, and reads raw response text from `output[].content[]` entries with `output_text`. Both providers return private, typed advisory candidates with provenance. Base versions and source revisions are checked before application; stale candidates are rejected, and a human must apply, edit, or reject the result. If a provider is unavailable, the affected control/endpoint reports an explicit unavailable state while non-AI workflows continue.

## Authentication, identities, and integrations

Better Auth runs at the API boundary and persists account/session state in D1. Supported interactive authentication is email/password plus one-time email magic links with required verified email. Email or username identity changes require reauthentication and verification of the new address; event grants remain attached to the stable account ID. There is no social OAuth provider, including Google or Microsoft, and no social-OAuth configuration is required.

OpenSend is the email and calendar delivery boundary at `https://opensend.namuh.co`. Approved sender identities are:

- `auth@sessionboard.namuh.co` for verification and account messages;
- `speakers@sessionboard.namuh.co` for speaker, decision, reminder, task, and organizer-group messages;
- `calendar@sessionboard.namuh.co` for schedule publication, update, and cancellation messages.

Calendar delivery is provider-neutral RFC 5545 `REQUEST`, `UPDATE`, and `CANCEL` through OpenSend, with stable UIDs under `calendar.sessionboard.namuh.co`, increasing `SEQUENCE`, explicit IANA `TZID`, and room/video details when present. Direct provider calendar writes and calendar-provider OAuth are not required.

Deployment origins and Cloudflare resource identifiers are operator
configuration and are not part of the public product contract. Each environment
must use distinct HTTPS web/API origins and isolated D1, R2, and Queue
resources. Custom domains are recommended after DNS, Worker bindings,
cookies/CORS, callbacks, health checks, and release evidence are configured and
verified.

Accelevents is a separate external event platform. It is not in the competition brief or evaluator requirements and is not a supported Eventloom runtime feature. No Accelevents credentials, setup, publication, synchronization, or release gate is required. Historical adapter code or references do not change that classification.

## Security and tenant invariants

1. Every protected read and mutation derives organization, event, participant, reviewer, and API-key scope from the authenticated principal and server-side grants. A URL, query parameter, or guessed identifier never grants access.
2. Cross-tenant and cross-event access to records, profiles, tasks, reviews, files, exports, CRM contacts, and integration state is denied without revealing private data. Public endpoints use only current published projections.
3. Private R2 objects require fresh, expiring authorization. Uploads enforce type/size and scan/finalization rules; file history is immutable by version. Rich text and user-controlled values are sanitized before storage or rendering.
4. Secrets, magic links, API-key material, provider responses, and internal storage details never appear in public projections or ordinary API errors. Webhook signatures are checked and delivery retries are observable without exposing signing secrets.
5. Human decisions and published revisions are authoritative. AI suggestions are advisory and auditable. Concurrent writes use version checks, tenant/event locks where needed, and idempotency keys; retries do not duplicate decisions, messages, calendar events, exports, or webhooks.
6. Environment boundaries are enforced with separate resources and credentials; staging data and side effects cannot reach production.

## Acceptance rules

A behavior is supported only when its authorization, validation, persistence, error path, retry/idempotency behavior, and relevant public/private projection are defined. Source presence alone is not a pass. Acceptance evidence must use observable browser or API behavior against the intended environment and must preserve redacted artifacts without secrets.

The release gate is a seeded end-to-end scenario that covers CFP publication and draft/resume, multi-participant submission and routing, multi-round human review with advisory AI, a human decision, speaker tasks/files/forms and deliverables, conflict-checked agenda draft and immutable publication, OpenSend email and updateable/cancellable calendar delivery, public embeds/feeds, API keys and signed webhooks, CRM, reports/exports, and cross-persona/tenant denial checks. For AI specifically, release evidence must use the deployed staging UI/API against the selected real provider: an authorized request for agenda, evaluation, and remix proposals as enabled; provider provenance; proposal review; human apply/edit/reject; reload/persistence/audit; stale/version handling; explicit unavailable behavior; and proof that nothing auto-publishes, scores, decides, or overwrites records. It also requires real email, calendar, export, accessibility, performance, and nontechnical-organizer usability evidence. A run that times out, starts from dirty or stale state, uses mocked provider behavior, or omits manual checks cannot be release evidence.
Production may receive only bounded smoke after staging AI and non-AI acceptance is complete; production smoke is not a substitute for the staging workflow.

## Explicit non-goals

- Accelevents publication, synchronization, or any other external event-platform runtime integration.
- Social OAuth, Microsoft OAuth, Google OAuth, direct provider calendar APIs, or calendar-provider OAuth.
- External CRM synchronization, CRM marketing automation, SMS/campaign messaging, payment, sponsorship, exhibitor management, multilingual workflows, transcription/media AI, SbQL, and unrelated AI-insights products.
- Multiple parallel agenda scenarios, shared staging/production data or secrets, or pixel-for-pixel Sessionboard reproduction.

## Implementation status (evidence-based)

### Source coverage

The repository and cited evidence contain source coverage for each supported area below. **Source-present does not mean release-verified.**

| Area | Source-present evidence |
| --- | --- |
| CFP | CFP web/API features and submission validation/persistence sources |
| Portal | Portal web features and speaker/asset/task API sources |
| Review | Review workspace and evaluation-plan API sources |
| Communications | Communications workspace/service and OpenSend adapter sources |
| Agenda | Agenda workspace/engine and calendar-semantics sources |
| Embeds | Public embed projections and embed administration sources |
| API/webhooks | Public API routes, OpenAPI contract, and webhook delivery sources |
| Speaker CRM | Built-in CRM workspace/service/routes and evaluator coverage |
| Deliverables | Deliverables workspace and private speaker asset lifecycle sources |
| Reports | Reports workspace/service/routes and export sources |
| Advisory AI | Agenda suggestion, evaluation assistance, and content-remix sources |

### Current status

- **partial:** CFP, portal, review, communications, agenda, embeds, API/webhooks, Speaker CRM, deliverables, and reports have implementation/source coverage. Advisory AI is source-wired; mocked contract tests and opt-in synthetic OpenAI adapter/local agenda lifecycle checks pass, but no deployed staging AI workflow or complete product release verification has been accepted.
- **partial:** The latest completed evaluator run recorded in the ledger reached **60.3% overall** with **98% coverage** across all seven areas and left **19 manual checks pending**. It used the repaired canonical fixture, but source fixes made after the run began were not deployed into the observed production workflow. It remains completed automated diagnostic evidence, not release evidence.
- **partial:** No deployed end-to-end AI workflow has been accepted. The **31.3% AI Agenda diagnostic** is diagnostic evidence only, not validation or release evidence.
- **pending:** No clean post-reset full evaluator run has completed. Real email delivery, calendar update/cancel behavior, and export inspection remain outstanding. The custom web/API domains remain pending as described above.
- **partial:** Calendar timezone migration and DST-specific API error responses have a known gap. Private-upload policy requests malware scanning, but no supported file-scan Queue consumer completes that boundary. The production reminder Cron can also return early on invalid runtime configuration without durable failure evidence. These paths require implementation and release re-verification.
- **partial:** Release gates are incomplete, including full seeded browser/API workflow evidence, accessibility, performance, security/tenant checks, provider-side sender verification, real deployed AI provider workflows, and representative organizer usability evidence.
- **unsupported:** Accelevents is intentionally unsupported, not an incomplete release feature. Social OAuth is likewise unsupported by contract.

No current area is labeled **release-verified**. The historical evaluator ledger in `docs/llm-judge-runs.md` is the record of run evidence and must be updated with a new dated entry before any future run can be considered.
