# Calendar and timezone semantics

Eventloom sends provider-neutral RFC 5545 attachments through OpenSend at `https://opensend.namuh.co`. It does not write directly to a calendar provider account. Calendar delivery is an email attachment/outbox boundary, not an external sign-in integration.

## Current implementation status

The sections below define the intended calendar contract and the invariants the serializer/lifecycle components are designed to preserve. They are not a claim that an end-to-end release run has completed. Current known implementation gaps are:

- Changing an event timezone does not yet perform a complete schedule migration: draft entries are not fully reinterpreted, revalidated, and republished through one delivered workflow.
- The API does not yet map resolver-specific DST failures to stable public error codes. Unit-level timezone resolution may identify `NONEXISTENT_LOCAL_TIME` and `AMBIGUOUS_LOCAL_TIME`, but a browser/API run must record the actual response rather than claim those codes are delivered.

Do not present either gap as a shipped feature or convert it into a pass using only unit-level tests.

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

These semantic conditions are implementation intent, not a release assertion about the current API response. In particular, the API-level mapping for DST-specific errors and the event-timezone migration workflow remain known gaps as stated above.

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
| Spring-forward invalid local time | Resolver contract rejects it; API error mapping is a known gap | Do not mark API code as delivered |
| Fall-back ambiguous local time | Explicit earlier/later choice resolves predictably; API mapping is a known gap | Record actual API response |
| Event timezone change | Full draft migration/revalidation/new publication | Known implementation gap; not delivered |
| Unicode over 75 octets | Attachment unfolds to the original valid text | Must be observed in a controlled importer |

Release evidence must distinguish local serializer/unit tests from staging Ever/`codex-cua` and real OpenSend/calendar observations. Never retain attendee secrets, passwords, or authentication links.
