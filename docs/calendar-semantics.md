# Calendar and timezone semantics

Eventloom sends provider-neutral RFC 5545 attachments through OpenSend at `https://opensend.namuh.co`. It does not write directly to a calendar provider account. Calendar delivery is an email attachment/outbox boundary, not an external sign-in integration.

## Current implementation status

The sections below describe the implemented temporal contract and the invariants the serializer and lifecycle components preserve. They are not a claim that an end-to-end release run, staging run, or calendar-client delivery has completed. Remaining limitations are called out where they affect the evidence status.

## Source of time

Each event owns one canonical IANA timezone, such as `America/Los_Angeles`. Organizer input is a wall-clock local date-time plus that event timezone. The agenda model stores both the normalized instant and the entered wall time:

- `startsAt` / `endsAt`: ISO 8601 instants with an explicit offset for comparison and delivery.
- `startsAtLocal` / `endsAtLocal`: organizer-entered local wall time without an offset.
- `timeZone`: canonical IANA timezone used to interpret and display the wall time.

Organizer and public surfaces default to the event timezone. A viewer-local presentation is display-only; it must not change stored instants, conflict detection, publication, or calendar payloads.

## Local-time and DST contract

The resolver accepts `YYYY-MM-DDTHH:mm[:ss]` without an offset because the event timezone supplies the zone. Its contract is:

- Reject an unknown IANA timezone.
- Reject impossible calendar values.
- Reject a spring-forward wall time that never occurs with the semantic condition `NONEXISTENT_LOCAL_TIME` rather than silently shifting it.
- Reject a fall-back wall time that occurs twice with `AMBIGUOUS_LOCAL_TIME` unless the organizer explicitly chooses `earlier` or `later`.
- Require the resolved end instant to be strictly after the resolved start instant.

The agenda engine and its route error mapping expose stable field-level errors for these cases. A nonexistent local time is reported on the affected local-time field with `nonexistent_local_time`; an ambiguous time is reported with `ambiguous_local_time`. The resolver still requires an explicit `earlier` or `later` choice for a fold. These claims describe code and tests, not deployed or staging observations.

## Event and agenda boundaries

Event `startsAt` and `endsAt` are exact instants. Agenda entries must start at or after the event start and end at or before the event end. Each entry must also start and end on the same allowed local schedule date. When an event supplies sparse `scheduleDates`, only those dates are allowed. Without an explicit sparse list, the allowed dates are the local date range from the event start through the event end. These checks apply to direct agenda mutations as well as route callers, and entries must have a strictly positive duration.

Agenda timezone is always derived from the authoritative event; callers cannot select a separate agenda timezone. Changing an event timezone is rejected while any agenda state exists, even when the draft is empty. This protects stored local interpretations and dependent schedules. The current implementation does not provide a complete automatic migration and republish workflow for an existing agenda. That is a remaining limitation, not evidence that timezone changes are migrated automatically.

## Draft, publication, and downstream work

The agenda is a private, versioned draft. Same-room, same-participant, and shared-resource overlaps are hard conflicts. Capacity, track, travel-time, and custom rules are warnings; publishing a warning requires an actor-attributed reason. A hard conflict cannot be overridden.

Publication is one locked operation:

1. Compare the expected draft/state version.
2. Re-run timezone and schedule validation available to the current implementation.
3. Reject hard conflicts and unoverridden warnings.
4. Create an immutable published revision.
5. Set that revision as current.
6. Append idempotent outbox work for public agenda projections, embed-cache invalidation, webhook delivery, and calendar delivery.

Public feeds and embeds read only the current immutable revision. Rollback creates a new immutable revision derived from an earlier one; it does not mutate history. Corrective calendar work uses the same outbox and idempotency rules.

Event date updates also protect dependent temporal data. An event cannot be shortened below any retained review-plan boundary or agenda entry. Historical event dates may remain unchanged, but changing a past value is rejected.

New review-plan and round boundaries cannot be before today in the event timezone or after the exact event end. Exact unchanged historical boundaries remain valid, the overall deadline cannot precede the final round close, and authoring surfaces warn without blocking when review continues after event start but remains within event end.

CFP windows must have an open time before the close time, and neither boundary can extend past the authoritative event start. New CFP dates cannot be before today in the event timezone. The standalone date-only editor preserves an unchanged persisted instant exactly, including a non-midnight instant; changing the calendar date intentionally applies the documented event-local date-only conversion.

## Calendar identity

A session's calendar event has a stable UID derived from tenant, event, and session coordinates:

```text
<encoded-tenant>.<encoded-event>.<encoded-session>@calendar.sessionboard.namuh.co
```

Components are percent-encoded to avoid delimiter and header-injection collisions. The UID remains unchanged across reschedules, room changes, attendee changes, updates, and cancellation. A new session identity receives a new UID.

The first delivery for a UID is:

- lifecycle action `REQUEST`;
- RFC method `REQUEST`;
- `SEQUENCE:0`.

Each committed update increments the stored sequence exactly once. The application lifecycle action is `UPDATE`; the serialized RFC method remains `REQUEST`, so clients match the stable UID and higher sequence. Cancellation increments the sequence, uses `METHOD:CANCEL`, and includes `STATUS:CANCELLED`.

Replaying the same idempotency key with identical invitation content returns the original committed result. Reusing it for different content fails. An update or cancellation before the initial request, or a second initial request for an existing UID, is a sequence violation.

## RFC 5545 payload

Every generated attachment is intended to include:

- `VERSION:2.0`, `CALSCALE:GREGORIAN`, and a stable product identifier;
- a `VTIMEZONE` for the canonical IANA `TZID`;
- `UID`, `DTSTAMP`, and monotonically increasing `SEQUENCE`;
- `DTSTART;TZID=...` and `DTEND;TZID=...`;
- escaped `SUMMARY` and `LOCATION`;
- organizer `calendar@sessionboard.namuh.co`;
- one or more authorized `ATTENDEE` properties with RSVP requested;
- `TRANSP:OPAQUE`.

Calendar text escapes backslashes, line breaks, semicolons, and commas. Lines fold at the RFC 5545 75-octet limit without splitting a UTF-8 code point. Input containing CR/LF header injection is rejected.

The calendar email adapter builds a `text/calendar; charset=utf-8; method=REQUEST|CANCEL` attachment plus matching human-readable text/HTML. Update mail is visibly labeled as an update; cancellation mail is visibly labeled as cancelled. Wiring agenda publication through the adapter and ingesting bounce/complaint state require staging and release evidence; component source alone does not establish delivery.

## Speaker deadlines, travel, and expiring credentials

Speaker task and deliverable deadlines use strict, real `YYYY-MM-DD` calendar dates. They are inclusive through the end of that calendar day in the authoritative event timezone: the comparison boundary is the start of the following local date, resolved in that IANA timezone. A task becomes overdue at that boundary, reminder offsets are measured back from the same boundary, and scheduler cadence keys use those resolved instants. Bare calendar dates are never parsed as UTC instants. This keeps deadline behavior tied to event-local day boundaries across UTC offsets and daylight-saving transitions.

Newly selected deadlines cannot be before today in the event timezone, but an exact unchanged historical deadline may be retained when editing. Deadlines may fall after the event ends and produce a non-blocking warning.

Travel arrival and departure inputs also use strict `YYYY-MM-DD` semantics, require arrival to be no later than departure, and warn without blocking when travel falls outside the event dates. Legacy persisted timestamps are projected to dates in the authoritative event timezone; new timestamp-shaped travel input is rejected. Travel constraints remain warnings in agenda validation, not hard conflicts.

Supplied API-key expirations must be explicit-offset ISO instants, are normalized to UTC, and must be strictly later than the current time. Browser-local expiration input rejects nonexistent DST times and ambiguous repeated times rather than silently selecting an occurrence. A key without an expiration remains valid until revoked, and revoked or expired keys are rejected. This documents authentication behavior only. It does not claim that any key is deployed or active in a particular environment.

## Attendees and privacy

Only authorized session attendees receive private invitations. Evaluator identities, internal comments, task state, private assets, secondary-contact data not intended as attendees, and unpublished session data must not enter a calendar payload. The attendee list is part of the idempotency fingerprint; a changed list requires a new idempotency key and incremented sequence.

Public iCal feeds are projections of the current published agenda and are distinct from private attendee invitations. Delivery records must not appear in public feeds.

## Failure and retry behavior

The assembled lifecycle must preserve these invariants:

- Sequence allocation is serialized per stable UID.
- Outbox jobs and provider requests receive stable idempotency keys.
- Retryable OpenSend failures retry without allocating another sequence.
- A content change creates a new lifecycle action and sequence; it is not a retry.
- Delivery, bounce, complaint, and terminal failure state remain visible to operators.
- Rollback never deletes delivery history.

Never decrement or reuse a sequence after a provider failure. Never create a new UID to work around a bad update; that creates duplicates in calendar clients and generic iCal importers.

## Verification matrix

Use fixed fixtures with non-ASCII titles/locations and a transition in the event timezone. Retain only redacted `.ics`, OpenSend delivery identifiers, message headers, and screenshots outside the repository:

| Scenario | Expected contract | Current evidence status |
| --- | --- | --- |
| Initial request | One event, sequence 0, event-zone wall time, organizer `calendar@sessionboard.namuh.co` | Must be observed through OpenSend |
| Time/room update | Existing UID changes, no duplicate, sequence increments | Must be observed through OpenSend/client import |
| Attendee update | Existing UID changes and intended recipients receive the update | Must be observed with synthetic recipients |
| Cancellation | Existing UID becomes cancelled, no second event | Must be observed with synthetic recipients |
| Retry same idempotency key | No second send or sequence allocation | Must be observed in delivery records |
| Spring-forward invalid local time | Resolver rejects it and the agenda surface reports `nonexistent_local_time` on the affected field | `packages/contracts/src/domain/temporal.test.ts`, `apps/api/src/features/agenda/engine.test.ts`; route mapping is covered in `apps/api/src/routes/agenda.test.ts`; local tests only, no deployment claim |
| Fall-back ambiguous local time | Missing disambiguation reports `ambiguous_local_time`; explicit earlier/later choices resolve predictably | `packages/contracts/src/domain/temporal.test.ts`, `apps/api/src/features/agenda/engine.test.ts`, `apps/api/src/routes/agenda.test.ts`; local tests only, no deployment claim |
| Exact event and sparse schedule boundaries | Entries outside exact instants or allowed local dates are rejected | Unit tests, including direct engine mutations |
| Event timezone change with active agenda | Change is rejected to protect active agenda entries | Event temporal dependency tests; no migration workflow claim |
| Review and CFP boundaries | Event shortening respects review and agenda boundaries; CFP boundaries are at or before event start | Event route and service tests; local tests only, no deployment claim |
| Speaker deadlines and travel | New past deadlines and invalid travel ordering are rejected; historical deadlines can remain unchanged | Speaker service tests |
| API-key expiration | Revoked or expired keys are rejected; non-expiring keys are checked only for revocation | Authenticator tests |
| Event timezone migration | Full draft migration/revalidation/new publication | Remaining limitation; not delivered |
| Unicode over 75 octets | Attachment unfolds to the original valid text | Must be observed in a controlled importer |

Release evidence must distinguish local serializer/unit tests from staging Ever/`codex-cua` and real OpenSend/calendar observations. Never retain attendee secrets, passwords, or authentication links.
