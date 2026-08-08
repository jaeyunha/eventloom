# Calendar and timezone semantics

Open Sessionboard sends provider-neutral RFC 5545 attachments through OpenSend. It does not write to Google Calendar or Microsoft Graph, and Google/Microsoft OAuth is unrelated to calendar delivery.

## Source of time

Each event owns one canonical IANA timezone, such as `America/Los_Angeles`. Organizer input is a wall-clock local date-time plus the event timezone. The agenda service resolves that input to an instant and stores both:

- `startsAt` / `endsAt`: ISO 8601 instants with an explicit offset, normalized for comparisons and delivery.
- `startsAtLocal` / `endsAtLocal`: the organizer-entered wall time.
- `timeZone`: the canonical IANA timezone used to interpret and display the wall time.

The event timezone is the default on organizer and public surfaces. A viewer-local presentation is optional display behavior only; it never changes stored instants, conflict detection, or calendar payloads.

## DST and local-time validation

Local input uses `YYYY-MM-DDTHH:mm[:ss]` without an offset because the event timezone supplies the zone.

- Unknown timezone names are rejected.
- Impossible calendar values are rejected.
- A spring-forward wall time that never occurs is rejected as `NONEXISTENT_LOCAL_TIME`; the system does not silently shift it.
- A fall-back wall time that occurs twice is rejected as `AMBIGUOUS_LOCAL_TIME` unless the organizer explicitly chooses `earlier` or `later`.
- End must be strictly after start after both values resolve to instants.

Changing an event timezone is therefore a schedule migration, not a cosmetic preference. Revalidate every draft entry and require a new publication before downstream delivery.

## Draft and publication lifecycle

The mutable agenda is a private, versioned draft. Same-room, same-participant, and shared-resource overlaps are hard conflicts. Capacity, track, travel-time, and custom rules are warnings; publishing a warning requires an actor-attributed reason. A conflict cannot be overridden.

Publication performs one locked operation:

1. Compare the expected draft/state version.
2. Re-run timezone and schedule validation.
3. Reject hard conflicts and unoverridden warnings.
4. Create an immutable published revision.
5. Set that revision as current.
6. Append idempotent outbox work for public agenda projection, embed-cache invalidation, calendar updates, and Accelevents readiness.

Public feeds and embeds read only the current immutable revision. They never read a private draft. Rollback creates a new immutable revision derived from an earlier one; it does not mutate history. Corrective calendar and integration work is emitted through the same outbox rules.

## Calendar identity

A calendar event is identified by a stable UID derived from the tenant, event, and session coordinates:

```text
<encoded-tenant>.<encoded-event>.<encoded-session>@calendar.foreverbrowsing.com
```

Components are percent-encoded to avoid delimiter and header-injection collisions. The UID remains unchanged across reschedules, room changes, attendee changes, updates, and cancellation. A new session identity receives a new UID.

The first delivery for a UID is:

- lifecycle action `REQUEST`
- RFC method `REQUEST`
- `SEQUENCE:0`

Each committed update increments the stored sequence exactly once. The application lifecycle action is `UPDATE`, but the serialized RFC method remains `REQUEST`; calendar clients match the UID and higher sequence to update the existing event rather than create another. Cancellation increments the sequence, uses `METHOD:CANCEL`, and includes `STATUS:CANCELLED`.

Replaying the same idempotency key and identical invitation content returns the original committed result. Reusing it for different content fails. An update/cancel before the initial request, or a second initial request for an existing UID, is a sequence violation.

## RFC 5545 payload

Every generated attachment includes:

- `VERSION:2.0`, `CALSCALE:GREGORIAN`, and a stable product identifier
- a `VTIMEZONE` for the canonical IANA `TZID`
- `UID`, `DTSTAMP`, and monotonically increasing `SEQUENCE`
- `DTSTART;TZID=...` and `DTEND;TZID=...`
- escaped `SUMMARY` and `LOCATION`
- organizer `calendar@foreverbrowsing.com`
- one or more `ATTENDEE` properties with RSVP requested
- `TRANSP:OPAQUE`

Calendar text escapes backslashes, line breaks, semicolons, and commas. Lines are folded at the RFC 5545 75-octet limit without splitting a UTF-8 code point. Input containing CR/LF header injection is rejected.

The calendar email adapter builds a `text/calendar; charset=utf-8; method=REQUEST|CANCEL` attachment plus matching human-readable text/HTML. Calendar and email share the input idempotency key. Update mail is visibly labeled as an update; cancellation mail is visibly labeled as cancelled.

The source defines the invitation serializer/lifecycle, email-message builder, and generic retrying OpenSend outbox as separate components. Wiring agenda publication through those components into provider delivery, plus ingesting bounce/complaint state, must be demonstrated by release assembly and end-to-end evidence; the component contracts alone do not establish that flow.

## Attendees and privacy

Only authorized session attendees receive invitations. Evaluator identities, internal comments, task state, private assets, secondary-contact data not intended as attendees, and unpublished session data must not enter calendar payloads. The attendee list is part of the idempotency fingerprint; a changed attendee list requires an update with a new idempotency key and incremented sequence.

Do not expose calendar delivery records through public feeds. Public iCal feeds are projections of the current published agenda and are distinct from private attendee invitations.

## Failure and retry behavior

Required assembled failure and retry behavior:

- Sequence allocation must be serialized per stable UID.
- Assembly must derive stable outbox job and provider idempotency keys.
- Retryable OpenSend failures may be retried without allocating another sequence.
- A content change creates a new lifecycle action and sequence; it is not a retry.
- Delivery, bounce, complaint, and terminal failure state must remain visible to operators.
- Rollback never deletes delivery history.

Do not decrement or reuse a sequence after a provider failure. Do not generate a new UID to work around a bad update; that produces duplicates in Gmail, Outlook, Apple Calendar, and generic iCal clients.

## Verification matrix

Use fixed fixtures that cross a DST transition and include non-ASCII titles/locations. For each client, prove that one session remains one event:

| Scenario | Expected result |
| --- | --- |
| Initial request | One event with sequence 0 and the event-zone wall time |
| Time/room update | Existing event changes; no duplicate; sequence increments |
| Attendee update | Existing event changes and intended recipients receive the update |
| Cancellation | Existing event becomes cancelled; no second event |
| Retry same idempotency key | No second provider send or sequence allocation |
| Spring-forward invalid time | Organizer sees validation error; nothing publishes |
| Fall-back ambiguous time | Explicit earlier/later choice resolves predictably |
| Unicode over 75 octets | Attachment unfolds to the original valid text |

Verify Gmail, Outlook, Apple Calendar, and a generic iCal importer before release. Retain the generated `.ics`, OpenSend delivery identifier, redacted message headers, and screenshots showing the single updated event. Never retain attendee secrets or authentication links in evidence.
