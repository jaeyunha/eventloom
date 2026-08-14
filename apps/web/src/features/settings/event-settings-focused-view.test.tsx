import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { EventSettingsData } from "./api";
import {
  type EventSettingsWorkspaceState,
  EventSettingsWorkspaceView,
} from "./event-settings-workspace";

const timestamp = "2026-08-14T12:00:00.000Z";

const data: EventSettingsData = {
  organizationId: "org-a",
  eventId: "event-b",
  settings: {
    id: "settings-a",
    tenantId: "org-a",
    eventId: "event-b",
    statuses: ["Draft", "Accepted"],
    agendaEligibleStatuses: ["Accepted"],
    version: 3,
    createdAt: timestamp,
    updatedAt: timestamp,
    createdBy: "organizer-a",
    updatedBy: "organizer-a",
    history: [],
  },
  rooms: [
    {
      id: "room-a",
      tenantId: "org-a",
      eventId: "event-b",
      name: "Main Hall",
      capacity: 240,
      resources: ["Projector"],
      version: 2,
      createdAt: timestamp,
      updatedAt: timestamp,
      createdBy: "organizer-a",
      updatedBy: "organizer-a",
      history: [],
    },
  ],
  tracks: [],
  formats: [],
  levels: [],
  tags: [],
  audit: [],
};

const state: EventSettingsWorkspaceState = {
  status: "loaded",
  data,
};

describe("focused event settings destinations", () => {
  it("renders only the selected workflow destination", () => {
    const html = renderToStaticMarkup(
      <EventSettingsWorkspaceView
        organizationId="org-a"
        eventId="event-b"
        section="workflow"
        state={state}
      />,
    );

    expect(html).toContain("Session workflow");
    expect(html).toContain("Session statuses");
    expect(html).toContain('id="workflow-heading"');
    expect(html).toContain('aria-labelledby="workflow-heading"');
    expect(html).toContain('aria-current="page"');
    expect(html).not.toContain('id="rooms"');
    expect(html).not.toContain("Main Hall");
    expect(html).not.toContain('id="classification"');
    expect(html).not.toContain('id="history"');
  });

  it("renders a focused rooms collection instead of the complete settings document", () => {
    const html = renderToStaticMarkup(
      <EventSettingsWorkspaceView
        organizationId="org-a"
        eventId="event-b"
        section="rooms"
        state={state}
      />,
    );

    expect(html).toContain("Rooms and venues");
    expect(html).toContain("Main Hall");
    expect(html).toContain("240 seats");
    expect(html).toContain('id="rooms-heading"');
    expect(html).toContain('aria-labelledby="rooms-heading"');
    expect(html).not.toContain('id="workflow"');
    expect(html).not.toContain("Configured session statuses");
    expect(html).not.toContain('id="classification"');
  });
});
