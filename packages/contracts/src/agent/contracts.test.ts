import { describe, expect, it } from "vitest";
import {
  accessContextSchema,
  accountAccessSchema,
  agentCapabilities,
  agentCapabilitySchema,
  agentRoleSchema,
  agentRoles,
  aggregateBriefingSchema,
  cliEnvelopeSchema,
  cliErrorEnvelopeSchema,
  cliExitCodeSchema,
  cliExitCodes,
  cliSuccessEnvelopeSchema,
  mapMembershipToAccessContexts,
  mapSpeakerScopeToAccessContext,
  organizerStatusSchema,
  principalVerifiedSpeakerScopeSchema,
  reviewerInboxSchema,
  reviewerWorkloadWarningSchema,
  speakerTasksSchema,
} from "./index";

const organization = { id: "org-1", name: "Eventloom" };
const event = { id: "evt-1", name: "Eventloom Summit" };
const profile = {
  name: "primary",
  origin: "https://eventloom.example",
  account: { id: "user-1", email: "agent@example.com" },
};
const generatedAt = "2026-08-13T00:00:00.000Z";

const organizationContext = {
  scope: "organization" as const,
  organization,
  membershipRole: "owner" as const,
  roles: ["organizer" as const],
  capabilities: ["organizer.overview.read" as const],
};

const eventContext = {
  scope: "event" as const,
  organization,
  event,
  membershipRole: "owner" as const,
  roles: ["organizer" as const, "reviewer" as const, "speaker" as const],
  capabilities: [
    "organizer.overview.read" as const,
    "reviewer.workspace.read" as const,
    "speaker.portal.read" as const,
    "speaker.tasks.read" as const,
  ],
};

const warning = {
  code: "PROFILE_EXPIRED" as const,
  message: "The saved session expired",
  profileName: "secondary",
};

const briefing = {
  generatedAt,
  profiles: { requested: 2, succeeded: 1, failed: 1 },
  items: [
    {
      profileName: "primary",
      organization,
      event,
      role: "speaker" as const,
      sourceId: "task-1",
      title: "Upload slides",
      deadline: "2026-08-14T00:00:00.000Z",
      severity: "normal" as const,
      urgency: "Upcoming" as const,
    },
  ],
  warnings: [warning],
  requestTraceIds: ["trace-1"],
};

const successEnvelope = {
  success: true as const,
  exitCode: 0 as const,
  output: {
    kind: "access" as const,
    accounts: [{ profile, contexts: [organizationContext, eventContext] }],
  },
  warnings: [warning],
  requestTraceIds: ["trace-1"],
};

describe("account access contracts", () => {
  it("parses organization and multi-role event contexts", () => {
    expect(accessContextSchema.parse(organizationContext)).toEqual(organizationContext);
    expect(accessContextSchema.parse(eventContext)).toEqual(eventContext);
    expect(
      accountAccessSchema.parse({
        profile,
        contexts: [organizationContext, eventContext],
      }).contexts,
    ).toHaveLength(2);
  });

  it("keeps an organization membership visible when it has zero events", () => {
    expect(
      mapMembershipToAccessContexts({
        organization,
        membershipRole: "owner",
        events: [],
      }),
    ).toEqual([organizationContext]);
  });

  it("requires organization identity for every context and event identity only for event scope", () => {
    expect(
      accessContextSchema.safeParse({ ...organizationContext, organization: undefined }).success,
    ).toBe(false);
    expect(accessContextSchema.safeParse({ ...eventContext, event: undefined }).success).toBe(
      false,
    );
    expect(accessContextSchema.safeParse({ ...organizationContext, event }).success).toBe(false);
  });

  it("keeps roles and capabilities closed to the exact initial vocabulary", () => {
    expect(agentRoles).toEqual(["organizer", "reviewer", "speaker"]);
    expect(agentCapabilities).toEqual([
      "organizer.overview.read",
      "reviewer.workspace.read",
      "speaker.portal.read",
      "speaker.tasks.read",
    ]);
    expect(agentRoleSchema.safeParse("owner").success).toBe(false);
    expect(agentCapabilitySchema.safeParse("organizer.events.write").success).toBe(false);
    expect(accessContextSchema.safeParse({ ...eventContext, roles: ["admin"] }).success).toBe(
      false,
    );
    expect(
      accessContextSchema.safeParse({ ...eventContext, capabilities: ["speaker.tasks.write"] })
        .success,
    ).toBe(false);
  });

  it("maps owner and admin memberships to organizer reads at organization and event scope", () => {
    for (const membershipRole of ["owner", "admin"] as const) {
      expect(
        mapMembershipToAccessContexts({
          organization,
          membershipRole,
          events: [{ event, hasEvaluationPlan: false }],
        }),
      ).toEqual([
        { ...organizationContext, membershipRole },
        {
          scope: "event",
          organization,
          event,
          membershipRole,
          roles: ["organizer"],
          capabilities: ["organizer.overview.read"],
        },
      ]);
    }
  });

  it("maps reviewers only to events with evaluation plans", () => {
    expect(
      mapMembershipToAccessContexts({
        organization,
        membershipRole: "reviewer",
        events: [
          { event, hasEvaluationPlan: true },
          { event: { id: "evt-2", name: "No review plan" }, hasEvaluationPlan: false },
        ],
      }),
    ).toEqual([
      {
        scope: "organization",
        organization,
        membershipRole: "reviewer",
        roles: [],
        capabilities: [],
      },
      {
        scope: "event",
        organization,
        event,
        membershipRole: "reviewer",
        roles: ["reviewer"],
        capabilities: ["reviewer.workspace.read"],
      },
    ]);
  });

  it("maps principal-verified speaker scopes to portal and task reads", () => {
    expect(
      mapSpeakerScopeToAccessContext({ organization, event, principalVerified: true }),
    ).toEqual({
      scope: "event",
      organization,
      event,
      roles: ["speaker"],
      capabilities: ["speaker.portal.read", "speaker.tasks.read"],
    });
    const unverifiedScope: unknown = {
      organization,
      event,
      principalVerified: false,
    };
    expect(principalVerifiedSpeakerScopeSchema.safeParse(unverifiedScope).success).toBe(false);
  });
});

describe("CLI contracts", () => {
  it("documents and accepts exactly exit statuses 0 through 5", () => {
    expect(cliExitCodes).toEqual({
      success: 0,
      unexpectedFailure: 1,
      usageError: 2,
      authenticationFailure: 3,
      authorizationFailure: 4,
      aggregateFailure: 5,
    });
    for (const exitCode of [0, 1, 2, 3, 4, 5]) {
      expect(cliExitCodeSchema.parse(exitCode)).toBe(exitCode);
    }
    expect(cliExitCodeSchema.safeParse(6).success).toBe(false);
    expect(cliExitCodeSchema.safeParse("0").success).toBe(false);
  });

  it("parses success and every semantic error envelope", () => {
    expect(cliSuccessEnvelopeSchema.parse(successEnvelope)).toEqual(successEnvelope);

    const errors = [
      [1, "UNEXPECTED_FAILURE"],
      [2, "USAGE_ERROR"],
      [3, "AUTHENTICATION_FAILED"],
      [4, "INCOMPATIBLE_CONTEXT"],
      [5, "AGGREGATE_FAILURE"],
    ] as const;
    for (const [exitCode, code] of errors) {
      const envelope = {
        success: false as const,
        exitCode,
        error: { code, message: `Failure ${exitCode}` },
        requestTraceIds: [],
      };
      expect(cliErrorEnvelopeSchema.parse(envelope)).toEqual(envelope);
      expect(cliEnvelopeSchema.parse(envelope)).toEqual(envelope);
    }

    expect(
      cliErrorEnvelopeSchema.safeParse({
        success: false,
        exitCode: 3,
        error: { code: "USAGE_ERROR", message: "Mismatched semantics" },
        requestTraceIds: [],
      }).success,
    ).toBe(false);
    expect(cliSuccessEnvelopeSchema.safeParse({ ...successEnvelope, exitCode: 5 }).success).toBe(
      false,
    );
  });

  it("rejects credential and arbitrary secret fields instead of stripping them", () => {
    for (const secretField of ["cookie", "accessToken", "sessionToken", "privateKey"]) {
      expect(
        cliSuccessEnvelopeSchema.safeParse({ ...successEnvelope, [secretField]: "secret" }).success,
      ).toBe(false);
      expect(
        accountAccessSchema.safeParse({
          profile: { ...profile, [secretField]: "secret" },
          contexts: [organizationContext],
        }).success,
      ).toBe(false);
    }
    expect(
      accessContextSchema.safeParse({
        ...eventContext,
        payload: { operation: "delete", sessionToken: "secret" },
      }).success,
    ).toBe(false);
  });

  it("does not admit generic raw operations, arbitrary payloads, or mutation capabilities", () => {
    expect(
      cliSuccessEnvelopeSchema.safeParse({
        ...successEnvelope,
        operation: "raw",
        payload: { url: "https://eventloom.example/private" },
      }).success,
    ).toBe(false);
    expect(agentCapabilitySchema.safeParse("reviewer.workspace.write").success).toBe(false);
  });
});

describe("workload and briefing contracts", () => {
  it("parses organizer, reviewer, and speaker workloads", () => {
    expect(
      organizerStatusSchema.parse({
        organizations: [
          {
            organization,
            membershipRole: "owner",
            actionItems: [
              {
                id: "action-1",
                title: "Confirm venue",
                dueAt: null,
                priority: 90,
              },
            ],
          },
        ],
      }).organizations,
    ).toHaveLength(1);

    expect(
      reviewerInboxSchema.parse({
        assignments: [
          {
            organization,
            event,
            planId: "plan-1",
            roundId: "round-1",
            assignmentId: "assignment-1",
            title: "Review proposal",
            deadline: "2026-08-14T00:00:00.000Z",
          },
        ],
        warnings: [
          {
            code: "REVIEWER_WORKSPACE_UNAVAILABLE",
            message: "Reviewer workspace is unavailable for organization 'org-1'",
            profileName: "primary",
            organizationId: "org-1",
          },
        ],
      }),
    ).toMatchObject({
      assignments: [{ assignmentId: "assignment-1" }],
      warnings: [{ organizationId: "org-1" }],
    });
    expect(
      reviewerWorkloadWarningSchema.safeParse({
        code: "WORKSPACE_UNAVAILABLE",
        organization,
        message: "Provider table base_123 failed",
      }).success,
    ).toBe(true);
    expect(
      reviewerWorkloadWarningSchema.safeParse({
        code: "WORKSPACE_UNAVAILABLE",
        organization,
        message: "failed",
        providerDetails: "secret",
      }).success,
    ).toBe(false);

    expect(
      speakerTasksSchema.parse({
        tasks: [
          {
            organization,
            event,
            taskId: "task-1",
            title: "Upload slides",
            dueAt: null,
            status: "not_started",
          },
        ],
      }).tasks,
    ).toHaveLength(1);
  });

  it("parses warnings and aggregate briefings through a success envelope", () => {
    expect(aggregateBriefingSchema.parse(briefing)).toEqual(briefing);
    expect(
      cliSuccessEnvelopeSchema.parse({
        ...successEnvelope,
        output: { kind: "briefing", briefing },
      }).output.kind,
    ).toBe("briefing");
  });
});
