import { describe, expect, it } from "vitest";
import {
  canonicalOrganizerEventHref,
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
  it("resolves backwards-compatible slugs and canonical UUID identifiers", () => {
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

  it("builds organization-scoped workspace URLs from canonical UUIDs", () => {
    expect(organizerEventWorkspaceHref("ai engineer", "summit/2026")).toBe(
      "/admin/organizations/ai%20engineer/events/summit%2F2026",
    );
    expect(
      organizerEventWorkspaceHref(
        "ai-engineer",
        "e66dc153-ec67-4f29-8b0f-8fc6733da05d",
        "/settings/workflow",
      ),
    ).toBe(
      "/admin/organizations/ai-engineer/events/e66dc153-ec67-4f29-8b0f-8fc6733da05d/settings/workflow",
    );
  });

  it.each([
    ["submissions", "/submissions"],
    ["reviews", "/reviews/evaluate"],
    ["agenda", "/agenda"],
  ])(
    "canonicalizes a legacy slug %s route to the UUID without losing its suffix",
    (_workspace, suffix) => {
      expect(
        canonicalOrganizerEventPath(
          `/admin/organizations/ai-engineer/events/summit-2026${suffix}`,
          "ai-engineer",
          "summit-2026",
          events[0],
        ),
      ).toBe(
        `/admin/organizations/ai-engineer/events/e66dc153-ec67-4f29-8b0f-8fc6733da05d${suffix}`,
      );
    },
  );

  it("preserves nested suffixes and query strings when resolving a slug URL to its UUID", () => {
    expect(
      canonicalOrganizerEventHref(
        "/admin/organizations/ai-engineer/events/summit-2026/reviews/evaluate",
        "assignee=organizer-1&status=pending",
        "ai-engineer",
        "summit-2026",
        events[0],
      ),
    ).toBe(
      "/admin/organizations/ai-engineer/events/e66dc153-ec67-4f29-8b0f-8fc6733da05d/reviews/evaluate?assignee=organizer-1&status=pending",
    );
  });

  it.each(["submissions", "reviews", "agenda"])(
    "keeps direct UUID %s routes canonical",
    (workspace) => {
      expect(
        canonicalOrganizerEventPath(
          `/admin/organizations/ai-engineer/events/e66dc153-ec67-4f29-8b0f-8fc6733da05d/${workspace}`,
          "ai-engineer",
          "e66dc153-ec67-4f29-8b0f-8fc6733da05d",
          events[0],
        ),
      ).toBeNull();
    },
  );

  it("parses only event identities from organizer API collections", () => {
    expect(
      parseOrganizerEventCollection({
        data: [
          {
            ...events[0],
            organizationId: "ai-engineer",
          },
        ],
      }),
    ).toEqual(events);
    expect(() => parseOrganizerEventCollection({ data: [{ id: "event-a" }] })).toThrow(
      "organizer event collection",
    );
  });
});
