import { describe, expect, it } from "vitest";
import {
  canonicalOrganizerEventPath,
  organizerEventWorkspaceHref,
  parseOrganizerEventCollection,
  resolveOrganizerEventReference,
} from "./organizer-event-route";

const events = [
  {
    id: "e66dc153-ec67-4f29-8b0f-8fc6733da05d",
    name: "Summit 2026",
    slug: "summit-2026",
  },
] as const;

describe("organizer event routes", () => {
  it("resolves both the public slug and legacy internal identifier", () => {
    expect(resolveOrganizerEventReference(events, "summit-2026")).toEqual(events[0]);
    expect(resolveOrganizerEventReference(events, "SUMMIT-2026")).toEqual(events[0]);
    expect(resolveOrganizerEventReference(events, "e66dc153-ec67-4f29-8b0f-8fc6733da05d")).toEqual(
      events[0],
    );
    expect(resolveOrganizerEventReference(events, "missing-event")).toBeUndefined();
  });

  it("refuses an ambiguous cross-record ID and slug collision", () => {
    expect(
      resolveOrganizerEventReference(
        [
          ...events,
          {
            id: "summit-2026",
            name: "Legacy collision",
            slug: "legacy-collision",
          },
        ],
        "summit-2026",
      ),
    ).toBeUndefined();
  });

  it("builds organizer workspace URLs from the organization-scoped slug", () => {
    expect(organizerEventWorkspaceHref("ai engineer", "summit/2026")).toBe(
      "/admin/organizations/ai%20engineer/events/summit%2F2026",
    );
    expect(organizerEventWorkspaceHref("ai-engineer", "summit-2026", "/settings/workflow")).toBe(
      "/admin/organizations/ai-engineer/events/summit-2026/settings/workflow",
    );
  });

  it("canonicalizes legacy ID paths without losing the workspace suffix", () => {
    expect(
      canonicalOrganizerEventPath(
        "/admin/organizations/ai-engineer/events/e66dc153-ec67-4f29-8b0f-8fc6733da05d/settings/workflow",
        "ai-engineer",
        "e66dc153-ec67-4f29-8b0f-8fc6733da05d",
        events[0],
      ),
    ).toBe("/admin/organizations/ai-engineer/events/summit-2026/settings/workflow");

    expect(
      canonicalOrganizerEventPath(
        "/admin/organizations/ai-engineer/events/summit-2026/settings/workflow",
        "ai-engineer",
        "summit-2026",
        events[0],
      ),
    ).toBeNull();
  });

  it("parses only event identities from organizer API collections", () => {
    expect(
      parseOrganizerEventCollection({
        data: [
          {
            ...events[0],
            organizationId: "ai-engineer",
            status: "draft",
          },
        ],
      }),
    ).toEqual(events);
    expect(() => parseOrganizerEventCollection({ data: [{ id: "event-a" }] })).toThrow(
      "organizer event collection",
    );
  });
});
