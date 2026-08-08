# Open Sessionboard Architecture

## System shape

Open Sessionboard is a multi-tenant program-management SaaS with three delivery surfaces: organizer administration, speaker self-service, and public embeds. A Next.js application consumes a single Hono API deployed on Cloudflare Workers.

## Responsibilities

### Next.js web

Renders the Sessionboard-inspired interface, manages accessible browser interactions, and calls the Worker API. It contains no direct Airtable, D1, R2, or provider credentials.

### Hono API worker

Owns authentication enforcement, tenant authorization, validation, business workflows, public API contracts, webhook delivery, and integration orchestration. All write endpoints support idempotency where retries are plausible.

### Airtable

Authoritative store for organizations, events, forms, submissions, participants, profiles, review plans, evaluations, decisions, tasks, sessions, rooms, tracks, and agenda versions. Stable application IDs are stored independently of Airtable record IDs.

### Cloudflare state

- **D1:** Better Auth tables, API keys, idempotency keys, webhook registrations/deliveries, publication receipts, audit indexes, and integration configuration metadata.
- **Durable Objects:** tenant/event mutation serialization, schedule locks, conflict checks, and monotonically increasing calendar sequence allocation.
- **R2:** private uploads and export artifacts exposed only through authorized, expiring access.
- **Queues:** transactional email, calendar delivery, webhook delivery, exports, and controlled outbound publication.

## Authentication and authorization

Better Auth runs in the Hono API and persists to D1. Magic-link login is required; Google and Microsoft OAuth are optional provider paths. Roles are organization-scoped (`owner`, `admin`, `reviewer`) while speakers access only their own profile, submissions, participants, and tasks. Public embeds use explicitly published projections.

## Core workflow

1. An organizer configures an event and its CFP form.
2. A speaker creates an account, saves drafts, adds participants, reviews, and submits.
3. Organizers assign reviewers through evaluation plans; reviewers submit rubric scores and comments.
4. Human organizers make final decisions and trigger transactional communications.
5. Accepted submissions create speaker tasks and schedulable sessions.
6. Schedule mutations are conflict-checked and versioned before publication.
7. Publication updates public embeds, calendar messages, webhooks, and optional Accelevents previews/pushes.

## Integration contracts

- **OpenSend:** sender identities `auth@foreverbrowsing.com`, `speakers@foreverbrowsing.com`, and `calendar@foreverbrowsing.com`; queue-backed retries and delivery auditing.
- **Calendar:** RFC 5545 `REQUEST`, `UPDATE`, and `CANCEL` messages with stable UID, incrementing SEQUENCE, explicit TZID, and deterministic attendee identity. Calendar-provider OAuth is not required.
- **Accelevents:** outbound-only preview/diff followed by explicit organizer confirmation; never an implicit write-through.
- **Public API:** versioned REST resources, scoped API keys, OpenAPI documentation, cursor pagination, idempotent writes, consistent errors, and signed retrying webhooks.

## Reliability and security invariants

- Every protected query is tenant-scoped and authorization-tested.
- Secrets are encrypted or kept in provider secret stores and are never returned by APIs.
- Rich text is sanitized before persistence and rendering.
- Schedule conflicts cannot be bypassed by concurrent writes.
- Human decisions remain authoritative; AI may summarize or assist but may not accept or reject submissions.
- External side effects are queued, idempotent, observable, and auditable.
- Public projections contain only explicitly published fields.

## Delivery model

The repository begins with one evidence/specification root commit. Implementation proceeds in focused commits. The Forge repository remains private until the complete automated, Ever, and `codex-cua` release gate passes.
