import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { qualifiedEventContext } from "../admin/admin-shell";
import {
  createEventSettingsApi,
  defaultAgendaEligibleStatuses,
  defaultSessionStatuses,
  type EventRoom,
  EventSettingsApiError,
  type EventSettingsAuditEntry,
  type EventSettingsData,
  type EventTaxonomyResource,
  type SessionSettingsRecord,
  validateRoomInput,
} from "./api";
import { EventSettingsWorkspaceView, validateRoomForm } from "./event-settings-workspace";

const settings: SessionSettingsRecord = {
  id: "settings_event-a",
  tenantId: "org_a",
  eventId: "event-a",
  statuses: [...defaultSessionStatuses],
  agendaEligibleStatuses: [...defaultAgendaEligibleStatuses],
  version: 3,
  createdAt: "2026-08-09T10:00:00.000Z",
  updatedAt: "2026-08-09T10:30:00.000Z",
  createdBy: "organizer",
  updatedBy: "organizer",
  history: [],
};

const rooms: EventRoom[] = [
  {
    id: "room-main",
    tenantId: "org_a",
    eventId: "event-a",
    name: "Main room",
    capacity: 100,
    resources: ["Projector", "Microphones"],
    version: 2,
    createdAt: "2026-08-09T10:00:00.000Z",
    updatedAt: "2026-08-09T10:30:00.000Z",
    createdBy: "organizer",
    updatedBy: "organizer",
    history: [],
  },
];

const resource = (kind: string): EventTaxonomyResource => ({
  id: `${kind}-one`,
  tenantId: "org_a",
  eventId: "event-a",
  name: `One ${kind}`,
  description: "Event value",
  version: 1,
  createdAt: "2026-08-09T10:00:00.000Z",
  updatedAt: "2026-08-09T10:00:00.000Z",
  createdBy: "organizer",
  updatedBy: "organizer",
  history: [],
});

const audit: EventSettingsAuditEntry[] = [
  {
    id: "audit-1",
    tenantId: "org_a",
    eventId: "event-a",
    entityType: "settings",
    entityId: settings.id,
    action: "settings.updated",
    version: 3,
    actorId: "organizer",
    occurredAt: "2026-08-09T10:30:00.000Z",
  },
];

const overview: EventSettingsData = {
  organizationId: "org_a",
  eventId: "event-a",
  settings,
  rooms,
  tracks: [resource("track")],
  formats: [resource("format")],
  levels: [],
  tags: [],
  audit,
};

function response<T>(data: T, status = 200): Response {
  return new Response(JSON.stringify({ data }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("event settings API", () => {
  it("reads organization/event-qualified settings and library resources", async () => {
    const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
    const fetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, init });
      if (url.endsWith("/sessions/settings")) return response(settings);
      if (url.endsWith("/sessions/rooms")) return response(rooms);
      if (url.endsWith("/sessions/tracks")) return response(overview.tracks);
      if (url.endsWith("/sessions/formats")) return response(overview.formats);
      if (url.endsWith("/sessions/levels")) return response(overview.levels);
      if (url.endsWith("/sessions/tags")) return response(overview.tags);
      if (url.endsWith("/sessions/audit")) return response(audit);
      throw new Error(`Unexpected request ${url}`);
    };

    const api = createEventSettingsApi("https://api.example.test/", "org/a", fetcher);
    await expect(api.getOverview("event/a")).resolves.toMatchObject({
      organizationId: "org/a",
      eventId: "event/a",
    });
    expect(
      calls.every((call) =>
        call.url.includes("/api/admin/organizations/org%2Fa/events/event%2Fa/"),
      ),
    ).toBe(true);
    expect(calls.every((call) => call.init?.credentials === "include")).toBe(true);
  });

  it("creates and edits rooms with optimistic versions", async () => {
    const bodies: unknown[] = [];
    const fetcher = async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.body) bodies.push(JSON.parse(String(init.body)));
      return response(rooms[0]);
    };
    const api = createEventSettingsApi("https://api.example.test", "org_a", fetcher);

    await api.createRoom("event-a", {
      id: "room-side",
      name: "Side room",
      capacity: 25,
      resources: ["Whiteboard"],
    });
    await api.updateRoom("event-a", {
      roomId: "room-main",
      expectedVersion: 2,
      name: "Main room",
      capacity: 120,
      resources: ["Projector"],
    });
    expect(bodies).toEqual([
      { id: "room-side", name: "Side room", capacity: 25, resources: ["Whiteboard"] },
      { expectedVersion: 2, name: "Main room", capacity: 120, resources: ["Projector"] },
    ]);
  });

  it("preserves a version conflict as a structured API error", async () => {
    const api = createEventSettingsApi(
      "https://api.example.test",
      "org_a",
      async () =>
        new Response(
          JSON.stringify({
            error: {
              code: "VERSION_CONFLICT",
              message: "Reload the settings.",
              traceId: "trace-1",
            },
          }),
          { status: 409, headers: { "content-type": "application/json" } },
        ),
    );
    const error = await api
      .updateSettings("event-a", {
        expectedVersion: settings.version,
        statuses: settings.statuses,
        agendaEligibleStatuses: settings.agendaEligibleStatuses,
      })
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(EventSettingsApiError);
    expect(error).toMatchObject({ code: "VERSION_CONFLICT", status: 409, traceId: "trace-1" });
  });

  it("sends an audited agenda eligibility update and keeps Accepted as the default", async () => {
    let body: unknown;
    const updated = { ...settings, version: 4, agendaEligibleStatuses: ["Accepted", "Waitlisted"] };
    const fetcher = async (_input: RequestInfo | URL, init?: RequestInit) => {
      body = init?.body === undefined ? undefined : JSON.parse(String(init.body));
      return response(updated);
    };
    const api = createEventSettingsApi("https://api.example.test", "org_a", fetcher);
    await api.updateSettings("event-a", {
      expectedVersion: settings.version,
      statuses: settings.statuses,
      agendaEligibleStatuses: updated.agendaEligibleStatuses,
    });
    expect(defaultAgendaEligibleStatuses).toEqual(["Accepted"]);
    expect(body).toMatchObject({
      expectedVersion: 3,
      agendaEligibleStatuses: ["Accepted", "Waitlisted"],
    });
  });

  it("rejects invalid room capacity and duplicate/blank resources before a request", () => {
    expect(() => validateRoomInput({ name: "Room", capacity: 0 })).toThrow("positive integer");
    expect(() =>
      validateRoomInput({ name: "Room", capacity: 20, resources: ["Projector", "Projector"] }),
    ).toThrow("duplicates");
    expect(validateRoomForm("Room", "20", "Projector, microphones")).toMatchObject({
      input: { capacity: 20 },
    });
    expect(validateRoomForm("Room", "20", "Projector,, microphones")).toMatchObject({
      error: "Resource names cannot be empty.",
    });
  });
});

describe("event settings view", () => {
  it("renders accessible grouped navigation and explicit audit state", () => {
    const output = renderToStaticMarkup(
      createElement(EventSettingsWorkspaceView, {
        organizationId: "org_a",
        eventId: "event-a",
        state: { status: "loaded", data: overview },
      }),
    );
    expect(output).toContain('aria-label="Event settings sections"');
    expect(output).toContain("Event setup");
    expect(output).toContain("Library");
    expect(output).toContain("Communications");
    expect(output).toContain("Calendar");
    expect(output).toContain("Accepted");
    expect(output).toContain("Settings audit history");
    expect(output).toContain("Agenda eligibility and status settings updated to version 3.");
    expect(output).toContain("Organization org_a · Event event-a");
  });

  it("renders loading, empty, and error states without inventing records", () => {
    const loading = renderToStaticMarkup(
      createElement(EventSettingsWorkspaceView, {
        organizationId: "org_a",
        eventId: "event-a",
        state: { status: "loading" },
      }),
    );
    expect(loading).toContain("Loading event settings");
    const empty = renderToStaticMarkup(
      createElement(EventSettingsWorkspaceView, {
        organizationId: "org_a",
        eventId: "event-a",
        state: {
          status: "loaded",
          data: {
            ...overview,
            rooms: [],
            tracks: [],
            formats: [],
            levels: [],
            tags: [],
            audit: [],
          },
        },
      }),
    );
    expect(empty).toContain("No rooms configured yet.");
    expect(empty).toContain("No settings changes have been audited");
    const notice = renderToStaticMarkup(
      createElement(EventSettingsWorkspaceView, {
        organizationId: "org_a",
        eventId: "event-a",
        state: { status: "loaded", data: overview },
        notice: "Unable to complete this change. Retry the request.",
      }),
    );
    expect(notice).toContain('role="status"');
    expect(notice).toContain("Retry the request.");
    const error = renderToStaticMarkup(
      createElement(EventSettingsWorkspaceView, {
        organizationId: "org_a",
        eventId: "event-a",
        state: { status: "error", message: "The settings API is unavailable." },
      }),
    );
    expect(error).toContain("The settings API is unavailable.");
  });
  it("adds settings navigation context only for qualified event routes", () => {
    expect(qualifiedEventContext("/admin/organizations/org_a/events/event-a/settings")).toEqual({
      organizationId: "org_a",
      eventId: "event-a",
    });
    expect(qualifiedEventContext("/admin/events")).toBeNull();
    expect(qualifiedEventContext("/admin/organizations//events/event-a/settings")).toBeNull();
  });
});
