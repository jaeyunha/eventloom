import type { D1Database } from "@cloudflare/workers-types";
import { describe, expect, it } from "vitest";

import {
  AccessContextDependencyError,
  AccessContextService,
} from "../../../features/access/service";
import { AccountSpeakerTasksService } from "../../../features/access/speaker-tasks";
import type { UserPrincipal } from "../../../features/auth/types";
import { capabilityAllows } from "../../../features/speaker/capabilities";
import type { SpeakerAssetAuditEntry, SpeakerTask } from "../../../features/speaker/types";
import { D1SpeakerRepository, portalSubmissionStatus } from "./speaker";

type QueryRow = Record<string, unknown>;

class RecordingD1 {
  readonly batches: string[][] = [];
  readonly queries: string[] = [];
  readonly sessionConstraints: string[] = [];
  readonly reads: { sql: string; values: unknown[] }[] = [];

  constructor(
    private readonly contextRows: readonly QueryRow[] = [],
    private readonly contextRow: QueryRow | null = null,
  ) {}

  withSession(constraint?: string) {
    this.sessionConstraints.push(constraint ?? "");
    return this;
  }

  prepare(sql: string) {
    this.queries.push(sql);
    const statement = {
      sql,
      values: [] as unknown[],
      bind: (...values: unknown[]) => {
        statement.values = values;
        return statement;
      },
      all: async () => {
        this.reads.push({ sql, values: statement.values });
        return {
          results: sql.includes("s.owner_account_id = ?")
            ? [
                {
                  organization_id: "org-1",
                  event_id: "event-1",
                  event_name: "Event One",
                  event_slug: "event-one",
                  event_status: "active",
                  submission_id: "submission-1",
                  participant_id: "participant-1",
                  participant_role: "primary",
                },
              ]
            : sql.includes("FROM portal_contexts pc")
              ? this.contextRows
              : [],
        };
      },
      first: async () => {
        this.reads.push({ sql, values: statement.values });
        if (sql.includes("GROUP BY s.organization_id")) {
          return {
            organization_id: "org-1",
            submission_ids: "submission-1",
            participant_ids: "participant-1",
            primary_participant_id: "participant-1",
          };
        }
        return sql.includes("FROM portal_contexts pc") ? this.contextRow : null;
      },
      raw: async () => {
        this.reads.push({ sql, values: statement.values });
        return sql.includes('from "events"') ? [["org-1", "event-1"]] : [];
      },
      run: async () => ({ meta: { changes: 1 } }),
    };
    return statement;
  }
  async batch(statements: Array<{ sql?: string }>) {
    this.batches.push(statements.map((statement) => statement.sql ?? String(statement)));
    return statements.map(() => ({ meta: { changes: 1 }, results: [] }));
  }
}

const task: SpeakerTask = {
  id: "task-1",
  eventId: "event-1",
  submissionId: null,
  participantId: "participant-1",
  subject: { type: "participant", participantId: "participant-1" },
  type: "upload",
  owner: "speaker",
  title: "Slides",
  status: "not_started",
  dependencyIds: ["task-0"],
  reminderOffsetsMinutes: [60],
  allowedMimeTypes: ["application/pdf"],
  maxBytes: 1_000_000,
  acceptedAssetKinds: ["slides"],
  version: 1,
  updatedAt: "2026-08-13T10:00:00.000Z",
};

const audit: SpeakerAssetAuditEntry = {
  id: "audit-1",
  organizationId: "org-1",
  eventId: "event-1",
  assetId: "asset-1",
  action: "approved",
  actorAccountId: "organizer-1",
  occurredAt: "2026-08-13T10:00:00.000Z",
  version: 1,
};

describe("D1SpeakerRepository", () => {
  it("projects authoritative decisions into participant submission status", () => {
    expect(portalSubmissionStatus("submitted", "accepted")).toBe("accepted");
    expect(portalSubmissionStatus("submitted", "rejected")).toBe("declined");
    expect(portalSubmissionStatus("submitted", "waitlisted")).toBe("under_review");
    expect(portalSubmissionStatus("submitted", undefined)).toBe("submitted");
  });

  it("discovers CFP applicant portal contexts from owned submissions", async () => {
    const database = new RecordingD1();
    const repository = new D1SpeakerRepository(database as unknown as D1Database);

    await expect(repository.listPortalContexts?.("account-1")).resolves.toEqual([
      {
        id: "event-1",
        organizationId: "org-1",
        eventId: "event-1",
        name: "Event One",
        slug: "event-one",
        status: "active",
        capabilities: ["submission-edit"],
        submissionIds: ["submission-1"],
        participantIds: ["participant-1"],
        primaryParticipantId: "participant-1",
      },
    ]);
    await expect(repository.listPortalContextScopes?.("account-1")).resolves.toEqual([
      {
        speakerProfileIds: [],
        context: {
          id: "event-1",
          organizationId: "org-1",
          eventId: "event-1",
          name: "Event One",
          slug: "event-one",
          status: "active",
          capabilities: ["submission-edit"],
          submissionIds: ["submission-1"],
          participantIds: ["participant-1"],
          primaryParticipantId: "participant-1",
        },
        scope: {
          tenantId: "org-1",
          submissionIds: ["submission-1"],
          participantIds: ["participant-1"],
          capabilities: ["submission-edit"],
          capabilitiesByParticipant: {
            "participant-1": ["submission-edit"],
          },
          primaryParticipantId: "participant-1",
          role: "speaker",
        },
      },
    ]);
    expect(database.queries.join("\n")).toContain("s.owner_account_id = ?");
    expect(database.sessionConstraints).toEqual(["first-primary", "first-primary"]);
  });

  it("authorizes CFP applicants to their owned submission resources", async () => {
    const database = new RecordingD1();
    const repository = new D1SpeakerRepository(database as unknown as D1Database);

    await expect(repository.getAccessScope("event-1", "account-1")).resolves.toEqual({
      tenantId: "org-1",
      submissionIds: ["submission-1"],
      participantIds: ["participant-1"],
      capabilities: ["submission-edit"],
      capabilitiesByParticipant: {
        "participant-1": ["submission-edit"],
      },
      primaryParticipantId: "participant-1",
      role: "speaker",
    });
    expect(database.queries.join("\n")).toContain("s.event_id = ?");
    expect(database.queries.join("\n")).toContain("s.owner_account_id = ?");
    expect(database.sessionConstraints).toContain("first-primary");
  });

  it("projects mixed participant capabilities from tenant-qualified D1 grants", async () => {
    const contextRow = {
      organization_id: "org-a",
      event_id: "event-1",
      id: "context-1",
      name: "Event One",
      slug: "event-one",
      status: "active",
      primary_participant_id: "participant-a",
      capabilities_json: '["submission-edit","task-response"]',
      participant_ids: "participant-a,participant-b",
      granted_participant_ids: "participant-a",
      granted_speaker_profile_ids: "profile:event-1:participant-a",
      submission_ids: "submission-1",
    };
    const database = new RecordingD1([contextRow], contextRow);
    const repository = new D1SpeakerRepository(database as unknown as D1Database);

    const organizationScope = await repository.getAccessScopeForOrganization(
      "org-a",
      "event-1",
      "account-1",
    );
    const projections = await repository.listPortalContextScopes("account-1");

    expect(organizationScope.capabilitiesByParticipant).toEqual({
      "participant-a": ["submission-edit", "task-response"],
      "participant-b": ["submission-edit"],
    });
    expect(projections[0]).toMatchObject({
      speakerProfileIds: ["profile:event-1:participant-a"],
      context: { participantIds: ["participant-a", "participant-b"] },
      scope: { capabilitiesByParticipant: organizationScope.capabilitiesByParticipant },
    });
    expect(
      organizationScope.participantIds.filter((participantId) =>
        capabilityAllows(organizationScope, "task-response", participantId),
      ),
    ).toEqual(["participant-a"]);
    expect(database.reads).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sql: expect.stringContaining("granted_speaker_profile_ids"),
          values: ["account-1"],
        }),
      ]),
    );

    const validPrincipal: UserPrincipal = {
      kind: "user",
      sessionId: "session-1",
      userId: "account-1",
      email: "speaker@example.test",
      memberships: [],
      speakerGrants: [
        { organizationId: "org-a", speakerProfileId: "profile:event-1:participant-a" },
      ],
    };
    const access = new AccessContextService({
      listOrganizationsForUser: async () => [{ organizationId: "org-a", name: "Org A" }],
      listEvents: async () => [{ organizationId: "org-a", eventId: "event-1", name: "Event One" }],
      listEvaluationPlans: async () => [],
      listSpeakerContextScopes: async () =>
        projections.map(({ context, scope, speakerProfileIds }) => ({
          organizationId: scope.tenantId ?? "",
          resolvedOrganizationIds: scope.tenantId === undefined ? [] : [scope.tenantId],
          eventId: context.eventId,
          accountId: "account-1",
          speakerProfileIds,
          participantIds: scope.participantIds,
          ...(scope.capabilities === undefined ? {} : { capabilities: scope.capabilities }),
          ...(scope.capabilitiesByParticipant === undefined
            ? {}
            : { capabilitiesByParticipant: scope.capabilitiesByParticipant }),
        })),
    });

    await expect(access.list(validPrincipal)).resolves.toEqual([
      {
        scope: "organization",
        organization: { id: "org-a", name: "Org A" },
        roles: [],
        capabilities: [],
      },
      {
        scope: "event",
        organization: { id: "org-a", name: "Org A" },
        event: { id: "event-1", name: "Event One" },
        roles: ["speaker"],
        capabilities: ["speaker.portal.read", "speaker.tasks.read"],
      },
    ]);
    await expect(
      access.list({
        ...validPrincipal,
        speakerGrants: [
          { organizationId: "org-a", speakerProfileId: "profile:event-1:participant-b" },
        ],
      }),
    ).rejects.toBeInstanceOf(AccessContextDependencyError);

    const taskParticipantReads: string[][] = [];
    const tasks = new AccountSpeakerTasksService({
      speakerTasks: {
        resolveScope: async () => ({
          ...organizationScope,
          tenantId: "org-a",
          organizationId: "org-a",
          eventId: "event-1",
          accountId: "account-1",
        }),
        listSubmissions: async () => [
          {
            organizationId: "org-a",
            eventId: "event-1",
            submissionId: "submission-1",
            participantIds: ["participant-a", "participant-b"],
          },
        ],
        listTasks: async (organizationId, eventId, participantIds) => {
          taskParticipantReads.push([...participantIds]);
          return [
            {
              organizationId,
              eventId,
              taskId: "task-a",
              submissionId: "submission-1",
              participantId: "participant-a",
              owner: "speaker",
              title: "Authorized task",
              dueAt: null,
              status: "not_started",
            },
          ];
        },
      },
    });

    await expect(tasks.list(validPrincipal, "org-a", "event-1")).resolves.toMatchObject({
      tasks: [{ taskId: "task-a" }],
    });
    expect(taskParticipantReads).toEqual([["participant-a"]]);
  });

  it("fails task reads closed for a submission-edit-only D1 context", async () => {
    const contextRow = {
      organization_id: "org-a",
      event_id: "event-1",
      id: "context-1",
      name: "Event One",
      slug: "event-one",
      status: "active",
      primary_participant_id: "participant-a",
      capabilities_json: '["submission-edit"]',
      participant_ids: "participant-a,participant-b",
      granted_participant_ids: "",
      submission_ids: "submission-1",
    };
    const database = new RecordingD1([contextRow], contextRow);
    const repository = new D1SpeakerRepository(database as unknown as D1Database);

    const scope = await repository.getAccessScopeForOrganization("org-a", "event-1", "account-1");

    expect(scope.capabilitiesByParticipant).toEqual({
      "participant-a": ["submission-edit"],
      "participant-b": ["submission-edit"],
    });
    expect(
      scope.participantIds.filter((participantId) =>
        capabilityAllows(scope, "task-response", participantId),
      ),
    ).toEqual([]);
  });

  it("qualifies account speaker scope, submission, and task reads by organization", async () => {
    const database = new RecordingD1();
    const repository = new D1SpeakerRepository(database as unknown as D1Database);

    await repository.getAccessScopeForOrganization("org-a", "event-shared", "account-1");
    await repository.listSubmissionsForOrganization("org-a", "event-shared", ["submission-shared"]);
    await repository.listTasksForOrganization("org-a", "event-shared", ["participant-shared"]);

    expect(database.reads).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sql: expect.stringContaining("pc.organization_id = ?"),
          values: ["org-a", "event-shared", "account-1"],
        }),
        expect.objectContaining({
          sql: expect.stringContaining('"submissions"."organization_id" = ?'),
          values: expect.arrayContaining(["org-a", "event-shared", "submission-shared"]),
        }),
        expect.objectContaining({
          sql: expect.stringContaining('"speaker_tasks"."organization_id" = ?'),
          values: expect.arrayContaining(["org-a", "event-shared", "participant-shared"]),
        }),
      ]),
    );
  });

  it("batches task metadata with the task create", async () => {
    const database = new RecordingD1();
    const repository = new D1SpeakerRepository(database as unknown as D1Database);

    const result = await repository.createTask?.({
      task,
      expectedVersion: null,
      actorAccountId: "organizer-1",
    });

    expect(result.ok).toBe(false); // the read-back is intentionally absent in this statement recorder
    expect(database.batches[0]?.join("\n")).toContain("INSERT INTO speaker_tasks");
    expect(database.batches[0]?.join("\n")).toContain("INSERT INTO speaker_task_dependencies");
    expect(database.batches[0]?.join("\n")).toContain("INSERT INTO speaker_task_reminder_offsets");
  });

  it("includes asset review and audit in one D1 batch", async () => {
    const database = new RecordingD1();
    const repository = new D1SpeakerRepository(database as unknown as D1Database);
    repository.getAsset = async () => ({
      id: "asset-1",
      tenantId: "org-1",
      eventId: "event-1",
      participantId: "participant-1",
      kind: "slides",
      objectKey: "private/asset-1",
      fileName: "slides.pdf",
      contentType: "application/pdf",
      sizeBytes: 100,
      state: "ready",
      createdAt: "2026-08-13T09:00:00.000Z",
      reviewVersion: 0,
      currentVersionId: "asset-1",
    });

    const result = await repository.reviewAsset?.({
      eventId: "event-1",
      assetId: "asset-1",
      state: "approved",
      expectedVersion: 0,
      reviewedAt: audit.occurredAt,
      reviewedBy: audit.actorAccountId,
      release: true,
      audit,
    });

    expect(result.ok).toBe(true);
    expect(database.batches).toHaveLength(1);
    expect(database.batches[0]?.join("\n")).toContain("UPDATE speaker_assets");
    expect(database.batches[0]?.join("\n")).toContain(
      "INSERT OR IGNORE INTO speaker_asset_comments",
    );
  });
});
