import { describe, expect, it } from "vitest";
import type { CalendarInvitationPayload } from "@open-sessionboard/contracts";
import {
  CalendarInvitationError,
  CalendarInvitationLifecycle,
  InMemoryCalendarInvitationRepository,
  createCalendarInvitation,
  createCalendarInvitationPayload,
  createCalendarUid,
  foldIcalLine,
  serializeCalendarInvitation,
  type CalendarInvitationActionInput,
  type CalendarInvitationScope,
} from "./index";

const scope: CalendarInvitationScope = {
  tenantId: "tenant-demo",
  eventId: "event-demo",
  sessionId: "session-demo",
};

const details: Omit<CalendarInvitationPayload, "uid" | "sequence"> = {
  method: "REQUEST",
  timeZone: "America/Los_Angeles",
  startsAt: "2025-03-09T09:30:00Z",
  endsAt: "2025-03-09T11:00:00Z",
  organizer: "calendar@foreverbrowsing.com",
  attendees: ["speaker@example.com", "host@example.com"],
  summary: "Session, with a; comma and \\slash",
  location: "Room 1, Building A",
  idempotencyKey: "calendar-demo-001",
};

function initialPayload(overrides: Partial<CalendarInvitationPayload> = {}): CalendarInvitationPayload {
  return {
    ...createCalendarInvitationPayload(scope, details),
    ...overrides,
  };
}

function actionInput(
  overrides: Partial<CalendarInvitationActionInput> = {},
): CalendarInvitationActionInput {
  return {
    ...scope,
    timeZone: details.timeZone,
    startsAt: details.startsAt,
    endsAt: details.endsAt,
    organizer: details.organizer,
    attendees: [...details.attendees],
    summary: details.summary,
    location: details.location,
    idempotencyKey: details.idempotencyKey,
    ...overrides,
  };
}

describe("calendar UID and lifecycle", () => {
  it("creates a stable UID scoped to tenant, event, and session", () => {
    const first = createCalendarUid(scope);
    expect(first).toBe("tenant-demo.event-demo.session-demo@calendar.foreverbrowsing.com");
    expect(createCalendarUid({ ...scope })).toBe(first);
    expect(createCalendarUid({ ...scope, sessionId: "another-session" })).not.toBe(first);
  });

  it("starts at sequence zero and increments update and cancellation atomically", async () => {
    const lifecycle = new CalendarInvitationLifecycle(
      new InMemoryCalendarInvitationRepository({
        now: () => new Date("2026-08-08T12:00:00.000Z"),
      }),
    );
    const first = await lifecycle.request(actionInput());
    const updated = await lifecycle.update(
      actionInput({ idempotencyKey: "calendar-demo-002", summary: "Updated session" }),
    );
    const cancelled = await lifecycle.cancel(
      actionInput({ idempotencyKey: "calendar-demo-003", summary: "Updated session" }),
    );

    expect(first.payload.sequence).toBe(0);
    expect(first.generatedAt).toBe("2026-08-08T12:00:00.000Z");
    expect(updated.payload.sequence).toBe(1);
    expect(cancelled.payload.sequence).toBe(2);
    expect(cancelled.payload.uid).toBe(first.payload.uid);
    expect(cancelled.ical).toContain("METHOD:CANCEL");
    expect(cancelled.ical).toContain("STATUS:CANCELLED");
  });

  it("replays an idempotency key and rejects a conflicting reuse", async () => {
    const repository = new InMemoryCalendarInvitationRepository();
    const first = await repository.publish(initialPayload());
    const replay = await repository.publish(initialPayload({ sequence: 99 }));
    expect(replay.payload.sequence).toBe(0);
    expect(replay.ical).toBe(first.ical);

    await expect(
      repository.publish(initialPayload({ summary: "Different content" })),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
  });
});

describe("RFC 5545 serialization", () => {
  it("serializes UPDATE as METHOD:REQUEST and escapes, folds, and terminates with CRLF", () => {
    const payload = initialPayload({
      method: "UPDATE",
      sequence: 4,
      summary: "Session, with a; comma and \\slash " + "unicode café 🚀 ".repeat(8),
    });
    const ical = serializeCalendarInvitation(payload);
    const lines = ical.split("\r\n").slice(0, -1);

    expect(ical).toContain("METHOD:REQUEST\r\n");
    expect(ical).toContain("SUMMARY:Session\\, with a\\; comma and \\\\slash");
    expect(ical).not.toMatch(/(^|[^\r])\n/);
    expect(lines.every((line) => new TextEncoder().encode(line).length <= 75)).toBe(true);
    expect(lines.some((line) => line.startsWith(" "))).toBe(true);
    expect(ical).toContain("TZID:America/Los_Angeles");
    expect(ical).toContain("DTSTART;TZID=America/Los_Angeles:");
    expect(ical).toContain("DTEND;TZID=America/Los_Angeles:");
    expect(ical).toContain("DTSTAMP:");
  });

  it("emits DST-aware VTIMEZONE data for spring and fall Los Angeles fixtures", () => {
    const spring = serializeCalendarInvitation(
      initialPayload({
        startsAt: "2025-03-09T09:30:00Z",
        endsAt: "2025-03-09T11:00:00Z",
      }),
    );
    expect(spring).toContain("DTSTART;TZID=America/Los_Angeles:20250309T013000");
    expect(spring).toContain("DTEND;TZID=America/Los_Angeles:20250309T040000");
    expect(spring).toContain("TZOFFSETFROM:-0800");
    expect(spring).toContain("TZOFFSETTO:-0700");
    expect(spring).toContain("BEGIN:DAYLIGHT\r\nDTSTART:20250309T020000");

    const fall = serializeCalendarInvitation(
      initialPayload({
        startsAt: "2025-11-02T08:30:00Z",
        endsAt: "2025-11-02T10:30:00Z",
      }),
    );
    expect(fall).toContain("DTSTART;TZID=America/Los_Angeles:20251102T013000");
    expect(fall).toContain("DTEND;TZID=America/Los_Angeles:20251102T023000");
    expect(fall).toContain("BEGIN:DAYLIGHT");
    expect(fall).toContain("BEGIN:STANDARD");
    expect(fall).toContain("BEGIN:STANDARD\r\nDTSTART:20251102T020000");
  });

  it("rejects invalid zones, malformed instants, invalid intervals, and CR/LF injection", () => {
    expect(() => serializeCalendarInvitation(initialPayload({ timeZone: "Not/AZone" }))).toThrow(
      CalendarInvitationError,
    );
    expect(() => serializeCalendarInvitation(initialPayload({ startsAt: "2025-02-30T09:30:00Z" }))).toThrow(
      CalendarInvitationError,
    );
    expect(() =>
      serializeCalendarInvitation(
        initialPayload({ startsAt: "2025-03-09T11:00:00Z", endsAt: "2025-03-09T11:00:00Z" }),
      ),
    ).toThrow(CalendarInvitationError);
    expect(() =>
      serializeCalendarInvitation(initialPayload({ uid: "bad\r\nX-Evil: yes" })),
    ).toThrow(CalendarInvitationError);
  });

  it("uses an injected DTSTAMP and safely escapes calendar text newlines", () => {
    const result = createCalendarInvitation(
      initialPayload({ summary: "First line\r\nSecond, line" }),
      { generatedAt: "2026-08-08T12:34:56.000Z" },
    );

    expect(result.generatedAt).toBe("2026-08-08T12:34:56.000Z");
    expect(result.ics).toContain("DTSTAMP:20260808T123456Z");
    expect(result.ics).toContain("SUMMARY:First line\\nSecond\\, line");
    expect(result.ics).not.toContain("\r\nSecond");
  });

  it("folds UTF-8 octets without splitting a code point", () => {
    const folded = foldIcalLine(`SUMMARY:${"🚀".repeat(40)}`);
    expect(folded.length).toBeGreaterThan(1);
    expect(folded.every((line) => new TextEncoder().encode(line).length <= 75)).toBe(true);
    expect(folded.slice(1).every((line) => line.startsWith(" "))).toBe(true);
  });
});
