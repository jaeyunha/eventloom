import { describe, expect, it } from "vitest";
import type { UserPrincipal } from "../auth/types";
import {
  type AccessContextDependencies,
  AccessContextDependencyError,
  AccessContextService,
} from "./service";

const organizationA = { organizationId: "org-a", name: "Alpha Organization" };
const organizationB = { organizationId: "org-b", name: "Beta Organization" };

function principal(overrides: Partial<UserPrincipal> = {}): UserPrincipal {
  return {
    kind: "user",
    sessionId: "session-1",
    userId: "user-1",
    email: "user@example.test",
    memberships: [{ organizationId: "org-a", role: "reviewer" }],
    speakerGrants: [{ organizationId: "org-a", speakerProfileId: "speaker-a" }],
    ...overrides,
  };
}

function dependencies(
  overrides: Partial<AccessContextDependencies> = {},
): AccessContextDependencies {
  return {
    listOrganizationsForUser: async () => [organizationA],
    listEvents: async (organizationId) =>
      organizationId === "org-a"
        ? [{ organizationId, eventId: "event-a", name: "Alpha Event" }]
        : [],
    listEvaluationPlans: async (organizationId) =>
      organizationId === "org-a" ? [{ organizationId, eventId: "event-a" }] : [],
    listSpeakerContextScopes: async () => [
      {
        organizationId: "org-a",
        resolvedOrganizationIds: ["org-a"],
        eventId: "event-a",
        accountId: "user-1",
        speakerProfileIds: ["speaker-a"],
        participantIds: ["participant-a"],
        capabilities: ["task-response"],
        capabilitiesByParticipant: { "participant-a": ["task-response"] },
      },
    ],
    ...overrides,
  };
}

describe("access context service", () => {
  it("keeps an empty organization and deterministically merges exact multi-role event capabilities", async () => {
    const service = new AccessContextService(
      dependencies({
        listOrganizationsForUser: async () => [organizationB, organizationA],
        listEvents: async (organizationId) =>
          organizationId === "org-a"
            ? [
                { organizationId, eventId: "event-z", name: "Zulu" },
                { organizationId, eventId: "event-a", name: "Alpha" },
              ]
            : [],
        listEvaluationPlans: async (organizationId) =>
          organizationId === "org-a" ? [{ organizationId, eventId: "event-a" }] : [],
      }),
    );

    await expect(
      service.list(
        principal({
          memberships: [
            { organizationId: "org-a", role: "reviewer" },
            { organizationId: "org-b", role: "owner" },
          ],
        }),
      ),
    ).resolves.toEqual([
      {
        scope: "organization",
        organization: { id: "org-a", name: "Alpha Organization" },
        membershipRole: "reviewer",
        roles: [],
        capabilities: [],
      },
      {
        scope: "event",
        organization: { id: "org-a", name: "Alpha Organization" },
        event: { id: "event-a", name: "Alpha" },
        membershipRole: "reviewer",
        roles: ["reviewer", "speaker"],
        capabilities: ["reviewer.workspace.read", "speaker.portal.read", "speaker.tasks.read"],
      },
      {
        scope: "organization",
        organization: { id: "org-b", name: "Beta Organization" },
        membershipRole: "owner",
        roles: ["organizer"],
        capabilities: ["organizer.overview.read"],
      },
    ]);
  });

  it.each([
    ["submission-edit-only", ["submission-edit"], false],
    ["one task-response participant", ["task-response"], true],
  ] as const)(
    "advertises task access for %s scope only when a participant is authorized",
    async (_label, participantCapabilities, expectedTaskAccess) => {
      const service = new AccessContextService(
        dependencies({
          listSpeakerContextScopes: async () => [
            {
              organizationId: "org-a",
              resolvedOrganizationIds: ["org-a"],
              eventId: "event-a",
              accountId: "user-1",
              speakerProfileIds: ["speaker-a", "speaker-b"],
              participantIds: ["participant-a", "participant-b"],
              capabilities: ["submission-edit", "task-response"],
              capabilitiesByParticipant: {
                "participant-a": participantCapabilities,
                "participant-b": ["submission-edit"],
              },
            },
          ],
        }),
      );

      const event = (await service.list(principal())).find(
        (context) => context.scope === "event" && context.event?.id === "event-a",
      );

      expect(event?.capabilities).toContain("speaker.portal.read");
      expect(event?.capabilities.includes("speaker.tasks.read")).toBe(expectedTaskAccess);
    },
  );

  it("does not merge equal event IDs from different organizations", async () => {
    const service = new AccessContextService(
      dependencies({
        listOrganizationsForUser: async () => [organizationB, organizationA],
        listEvents: async (organizationId) => [
          { organizationId, eventId: "shared-event", name: `${organizationId} event` },
        ],
        listEvaluationPlans: async () => [],
        listSpeakerContextScopes: async () => [],
      }),
    );

    const contexts = await service.list(
      principal({
        memberships: [
          { organizationId: "org-a", role: "owner" },
          { organizationId: "org-b", role: "admin" },
        ],
        speakerGrants: [],
      }),
    );

    expect(contexts.filter((context) => context.scope === "event")).toEqual([
      {
        scope: "event",
        organization: { id: "org-a", name: "Alpha Organization" },
        event: { id: "shared-event", name: "org-a event" },
        membershipRole: "owner",
        roles: ["organizer"],
        capabilities: ["organizer.overview.read"],
      },
      {
        scope: "event",
        organization: { id: "org-b", name: "Beta Organization" },
        event: { id: "shared-event", name: "org-b event" },
        membershipRole: "admin",
        roles: ["organizer"],
        capabilities: ["organizer.overview.read"],
      },
    ]);
  });

  it.each([
    [
      "a cross-tenant event",
      dependencies({
        listEvents: async () => [
          { organizationId: "org-b", eventId: "event-a", name: "Wrong tenant" },
        ],
      }),
    ],
    [
      "a missing speaker tenant identity",
      dependencies({
        listSpeakerContextScopes: async () =>
          [
            {
              organizationId: "",
              resolvedOrganizationIds: [],
              eventId: "event-a",
              accountId: "user-1",
              speakerProfileIds: ["speaker-a"],
              participantIds: ["participant-a"],
              capabilities: [],
            },
          ] as never,
      }),
    ],
    [
      "a conflicting or multiply-resolved speaker tenant identity",
      dependencies({
        listSpeakerContextScopes: async () => [
          {
            organizationId: "org-a",
            resolvedOrganizationIds: ["org-a", "org-b"],
            eventId: "event-a",
            accountId: "user-1",
            speakerProfileIds: ["speaker-a"],
            participantIds: ["participant-a"],
            capabilities: [],
          },
        ],
      }),
    ],
  ])("rejects %s", async (_label, source) => {
    await expect(new AccessContextService(source).list(principal())).rejects.toBeInstanceOf(
      AccessContextDependencyError,
    );
  });

  it("lists a grant-only speaker organization while preserving the organization context", async () => {
    const service = new AccessContextService(
      dependencies({
        listOrganizationsForUser: async () => [organizationA],
        listEvents: async () => [
          { organizationId: "org-a", eventId: "event-a", name: "Alpha Event" },
        ],
        listEvaluationPlans: async () => [],
        listSpeakerContextScopes: async () => [
          {
            organizationId: "org-a",
            resolvedOrganizationIds: ["org-a"],
            eventId: "event-a",
            accountId: "user-1",
            speakerProfileIds: ["profile:event-a:participant-a"],
            participantIds: ["participant-a"],
            capabilities: ["task-response"],
            capabilitiesByParticipant: { "participant-a": ["task-response"] },
          },
        ],
      }),
    );

    await expect(
      service.list(
        principal({
          memberships: [],
          speakerGrants: [
            { organizationId: "org-a", speakerProfileId: "profile:event-a:participant-a" },
          ],
        }),
      ),
    ).resolves.toEqual([
      {
        scope: "organization",
        organization: { id: "org-a", name: "Alpha Organization" },
        roles: [],
        capabilities: [],
      },
      {
        scope: "event",
        organization: { id: "org-a", name: "Alpha Organization" },
        event: { id: "event-a", name: "Alpha Event" },
        roles: ["speaker"],
        capabilities: ["speaker.portal.read", "speaker.tasks.read"],
      },
    ]);
  });

  it("rejects a D1 speaker context when the principal grant names another profile", async () => {
    const service = new AccessContextService(
      dependencies({
        listSpeakerContextScopes: async () => [
          {
            organizationId: "org-a",
            resolvedOrganizationIds: ["org-a"],
            eventId: "event-a",
            accountId: "user-1",
            speakerProfileIds: ["profile:event-a:participant-a"],
            participantIds: ["participant-a"],
            capabilities: ["task-response"],
            capabilitiesByParticipant: { "participant-a": ["task-response"] },
          },
        ],
      }),
    );

    await expect(
      service.list(
        principal({
          speakerGrants: [
            { organizationId: "org-a", speakerProfileId: "profile:event-a:participant-other" },
          ],
        }),
      ),
    ).rejects.toBeInstanceOf(AccessContextDependencyError);
  });

  it("does not retain a previously discovered speaker context after its grant is revoked", async () => {
    let active = true;
    const service = new AccessContextService(
      dependencies({
        listSpeakerContextScopes: async () =>
          active
            ? [
                {
                  organizationId: "org-a",
                  resolvedOrganizationIds: ["org-a"],
                  eventId: "event-a",
                  accountId: "user-1",
                  speakerProfileIds: ["speaker-a"],
                  participantIds: ["participant-a"],
                  capabilities: ["task-response"],
                  capabilitiesByParticipant: { "participant-a": ["task-response"] },
                },
              ]
            : [],
      }),
    );

    expect((await service.list(principal())).some((context) => context.scope === "event")).toBe(
      true,
    );
    active = false;
    expect((await service.list(principal())).some((context) => context.scope === "event")).toBe(
      true,
    );
    expect(
      (await service.list(principal({ speakerGrants: [] }))).some(
        (context) => context.scope === "event" && context.roles.includes("speaker"),
      ),
    ).toBe(false);
  });
});
