import { describe, expect, it } from "vitest";
import type { EventSettingsAuditEntry } from "./api";
import {
  eventSettingsAuditDiff,
  eventSettingsAuditPresentation,
  settingsOnlyAuditEntries,
} from "./event-settings-audit";

const roomUpdate: EventSettingsAuditEntry = {
  id: "audit-room",
  tenantId: "org-a",
  eventId: "event-b",
  entityType: "room",
  entityId: "room-a",
  action: "updated",
  version: 3,
  actorId: "organizer-a",
  occurredAt: "2026-08-14T12:00:00.000Z",
  before: {
    id: "room-a",
    name: "Main Hall",
    capacity: 200,
    resources: ["Projector"],
    version: 2,
  },
  after: {
    id: "room-a",
    name: "Main Hall",
    capacity: 240,
    resources: ["Projector", "Confidence monitor"],
    version: 3,
  },
};

describe("event settings change history", () => {
  it("turns authoritative snapshots into semantic field changes", () => {
    expect(eventSettingsAuditDiff(roomUpdate)).toEqual([
      {
        field: "Capacity",
        before: "200",
        after: "240",
      },
      {
        field: "Resources",
        before: "Projector",
        after: "Projector, Confidence monitor",
      },
    ]);
  });

  it("presents human settings language while retaining the technical revision", () => {
    expect(eventSettingsAuditPresentation(roomUpdate)).toMatchObject({
      domain: "Rooms and venues",
      entityLabel: "Main Hall",
      summary: "Changed capacity and resources",
      versionLabel: "v2 → v3",
    });
  });

  it("excludes ordinary session activity from the settings history destination", () => {
    const sessionEntry: EventSettingsAuditEntry = {
      ...roomUpdate,
      id: "audit-session",
      entityType: "session",
      entityId: "session-a",
      action: "created",
      before: undefined,
      after: { id: "session-a", title: "Opening keynote", version: 1 },
    };

    expect(settingsOnlyAuditEntries([sessionEntry, roomUpdate])).toEqual([roomUpdate]);
  });
});
