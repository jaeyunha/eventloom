import type { D1Database } from "@cloudflare/workers-types";
import { describe, expect, it } from "vitest";

import {
  AccessContextDependencyError,
  AccessContextService,
} from "../../../features/access/service";
import { AccountSpeakerTasksService } from "../../../features/access/speaker-tasks";
import type { UserPrincipal } from "../../../features/auth/types";
import type { Submission } from "../../../features/cfp/model";
import { capabilityAllows } from "../../../features/speaker/capabilities";
import { createSpeakerRoutes } from "../../../features/speaker/routes";
import { SpeakerService } from "../../../features/speaker/service";
import type {
  SpeakerAssetAuditEntry,
  SpeakerRepository,
  SpeakerTask,
  SpeakerTaskResponseRecord,
} from "../../../features/speaker/types";
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

class AcceptanceProjectionD1 {
  readonly contexts = new Map<string, QueryRow>();
  readonly contextSubmissions = new Set<string>();
  readonly contextParticipants = new Set<string>();
  readonly tasks: SpeakerTask[] = [];

  withSession() {
    return this;
  }

  prepare(sql: string) {
    const statement = {
      sql,
      values: [] as unknown[],
      bind: (...values: unknown[]) => {
        statement.values = values;
        return statement;
      },
      all: async () => {
        if (sql.includes("JOIN organization_memberships m")) {
          return { results: [{ organization_id: "org-1", role: "owner" }] };
        }
        if (sql.includes("JOIN evaluation_decisions d")) {
          return {
            results: [
              { submission_id: "submission-accepted", participant_id: "participant-priya" },
            ],
          };
        }
        if (sql.includes("s.owner_account_id = ?")) {
          return {
            results: [
              { submission_id: "submission-accepted", participant_id: "participant-priya" },
              { submission_id: "submission-draft", participant_id: "participant-priya" },
            ],
          };
        }
        if (sql.includes("p.claimed_user_id")) {
          return {
            results: [
              {
                participant_id: "participant-priya",
                claimed_user_id: "account-priya",
                verified_user_id: "account-priya",
              },
            ],
          };
        }
        if (sql.includes("FROM auth_users")) return { results: [{ id: "account-priya" }] };
        return { results: [] };
      },
      first: async () => {
        const values = statement.values;
        if (sql.includes("FROM events") && sql.includes("name, slug, status")) {
          return {
            organization_id: "org-1",
            id: "event-1",
            name: "DevFlow Conf 2027",
            slug: "devflow-conf-2027",
            status: "active",
          };
        }
        if (sql.includes("FROM portal_contexts")) {
          return this.contexts.get(String(values[2])) ?? null;
        }
        return null;
      },
      raw: async () => (sql.includes('from "events"') ? [["org-1", "event-1"]] : []),
      run: async () => {
        const values = statement.values;
        if (sql.includes("INSERT INTO portal_contexts")) {
          const id = String(values[0]);
          if (!this.contexts.has(id)) {
            this.contexts.set(id, {
              version: 1,
              capabilities_json: String(values[8]),
              name: String(values[4]),
              slug: String(values[5]),
              status: String(values[6]),
              primary_participant_id: String(values[7]),
            });
            return { meta: { changes: 1 } };
          }
          return { meta: { changes: 0 } };
        }
        if (sql.includes("UPDATE portal_contexts")) {
          const id = String(values[7]);
          const current = this.contexts.get(id);
          if (current === undefined || Number(current.version) !== Number(values[9])) {
            return { meta: { changes: 0 } };
          }
          this.contexts.set(id, {
            ...current,
            name: values[0],
            status: values[1],
            primary_participant_id: values[2],
            capabilities_json: values[3],
            version: Number(current.version) + 1,
          });
        }
        return { meta: { changes: 1 } };
      },
    };
    return statement;
  }

  async batch(statements: Array<{ sql?: string; values?: unknown[] }>) {
    for (const statement of statements) {
      const values = statement.values ?? [];
      if (statement.sql?.includes("portal_context_submissions")) {
        this.contextSubmissions.add(values.map(String).join(":"));
      }
      if (statement.sql?.includes("portal_context_participants")) {
        this.contextParticipants.add(values.map(String).join(":"));
      }
    }
    return statements.map(() => ({ meta: { changes: 1 }, results: [] }));
  }
}

class SpeakerWorkflowD1 {
  readonly reads: { sql: string; values: unknown[] }[] = [];
  readonly runs: { sql: string; values: unknown[] }[] = [];

  constructor(
    private readonly rows: Readonly<Record<string, readonly QueryRow[]>>,
    private readonly runChanges: readonly number[] = [],
  ) {}

  withSession() {
    return this;
  }

  prepare(sql: string) {
    const statement = {
      sql,
      values: [] as unknown[],
      bind: (...values: unknown[]) => {
        statement.values = values;
        return statement;
      },
      all: async () => {
        this.reads.push({ sql, values: statement.values });
        const table = Object.keys(this.rows).find((name) => sql.includes(`FROM ${name}`));
        return { results: table === undefined ? [] : [...(this.rows[table] ?? [])] };
      },
      first: async () => {
        this.reads.push({ sql, values: statement.values });
        const table = Object.keys(this.rows).find((name) => sql.includes(`FROM ${name}`));
        return table === undefined ? null : (this.rows[table]?.[0] ?? null);
      },
      raw: async () => {
        this.reads.push({ sql, values: statement.values });
        return sql.includes('from "events"') ? [["org-1", "event-1"]] : [];
      },
      run: async () => {
        this.runs.push({ sql, values: statement.values });
        return { meta: { changes: this.runChanges[this.runs.length - 1] ?? 1 } };
      },
    };
    return statement;
  }

  async batch(statements: Array<{ sql?: string }>) {
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

  it("materializes the accepted D1 portal handoff idempotently and preserves owned submission edits", async () => {
    const database = new AcceptanceProjectionD1();
    const repository = new D1SpeakerRepository(database as unknown as D1Database);
    const submission: Submission = {
      id: "submission-accepted",
      tenantId: "org-1",
      eventId: "event-1",
      formId: "form-1",
      ownerAccountId: "account-priya",
      formVersion: 1,
      status: "submitted",
      completedSteps: ["welcome", "account", "submission", "participant", "review"],
      answers: { title: "Reliable distributed workflows" },
      participants: [
        {
          id: "participant-priya",
          firstName: "Priya",
          lastName: "Raman",
          email: "priya@example.test",
          role: "primary",
          biography: "Builds reliable systems.",
          answers: {},
        },
      ],
      secondaryContacts: [],
      version: 3,
      createdAt: "2026-08-15T10:00:00.000Z",
      updatedAt: "2026-08-15T11:00:00.000Z",
      submittedAt: "2026-08-15T11:00:00.000Z",
    };

    await repository.ensureAcceptedSubmission({
      submission,
      updatedAt: "2026-08-15T12:00:00.000Z",
    });
    await repository.ensureAcceptedSubmission({
      submission,
      updatedAt: "2026-08-15T12:00:00.000Z",
    });

    expect(database.contexts).toHaveLength(1);
    const context = [...database.contexts.values()][0];
    expect(JSON.parse(String(context?.capabilities_json))).toEqual([
      "profile-self",
      "submission-edit",
      "task-response",
      "asset-read",
      "asset-write",
      "asset-comment",
    ]);
    expect(database.contextSubmissions).toEqual(
      new Set([
        "org-1:event-1:portal-context:org-1:event-1:account-priya:submission-accepted",
        "org-1:event-1:portal-context:org-1:event-1:account-priya:submission-draft",
      ]),
    );
    expect(database.contextParticipants).toEqual(
      new Set(["org-1:event-1:portal-context:org-1:event-1:account-priya:participant-priya"]),
    );
    await expect(repository.getOrganizerAccessScope("event-1", "organizer-1")).resolves.toEqual({
      tenantId: "org-1",
      eventId: "event-1",
      role: "owner",
      submissionIds: ["submission-accepted"],
      participantIds: ["participant-priya"],
    });
  });

  it("keeps revoked D1 grants from exposing accepted-speaker preparation capabilities", async () => {
    const contextRow = {
      organization_id: "org-1",
      event_id: "event-1",
      id: "context-1",
      name: "Event One",
      slug: "event-one--account-priya",
      status: "active",
      primary_participant_id: "participant-priya",
      capabilities_json:
        '["profile-self","submission-edit","task-response","asset-read","asset-write","asset-comment"]',
      owns_submission: 0,
      participant_ids: "participant-priya",
      granted_participant_ids: "",
      granted_speaker_profile_ids: "",
      submission_ids: "submission-accepted",
    };
    const repository = new D1SpeakerRepository(
      new RecordingD1([contextRow], contextRow) as unknown as D1Database,
    );

    await expect(repository.listPortalContexts?.("account-priya")).resolves.toMatchObject([
      { eventId: "event-1", capabilities: [] },
    ]);
    await expect(repository.getAccessScope("event-1", "account-priya")).resolves.toMatchObject({
      capabilities: [],
      capabilitiesByParticipant: { "participant-priya": [] },
    });
  });

  it("creates an organizer task through the normal route from D1 event authority", async () => {
    const database = new AcceptanceProjectionD1();
    const d1 = new D1SpeakerRepository(database as unknown as D1Database);
    const tasks: SpeakerTask[] = [];
    const acceptedSubmission = {
      tenantId: "org-1",
      id: "submission-accepted",
      eventId: "event-1",
      title: "Reliable distributed workflows",
      status: "accepted" as const,
      participantIds: ["participant-priya"],
      primaryParticipantId: "participant-priya",
      version: 3,
      updatedAt: "2026-08-15T12:00:00.000Z",
    };
    const repository: SpeakerRepository = {
      getAccessScope: d1.getAccessScope.bind(d1),
      getOrganizerAccessScope: d1.getOrganizerAccessScope.bind(d1),
      listSubmissions: async (_eventId, submissionIds) =>
        submissionIds.includes(acceptedSubmission.id) ? [acceptedSubmission] : [],
      getSubmission: async (_eventId, submissionId) =>
        submissionId === acceptedSubmission.id ? acceptedSubmission : null,
      listProfiles: async () => [
        {
          id: "speaker-profile:event-1:participant-priya",
          eventId: "event-1",
          participantId: "participant-priya",
          displayName: "Priya Raman",
          email: "priya@example.test",
          biography: "Builds reliable systems.",
          status: "accepted",
          version: 1,
          updatedAt: "2026-08-15T12:00:00.000Z",
        },
      ],
      getProfile: async () => null,
      updateBiography: async () => ({ ok: false, reason: "not_found" }),
      listTasks: async () => [...tasks],
      getTask: async (_eventId, taskId) => tasks.find((task) => task.id === taskId) ?? null,
      getTasksByIds: async (_eventId, taskIds) => tasks.filter((task) => taskIds.includes(task.id)),
      createTask: async ({ task }) => {
        const stored: SpeakerTask = {
          ...structuredClone(task),
          submissionId: task.submissionId?.replace(/^speaker-submission:/u, "") ?? null,
          ...(task.subject?.type === "session"
            ? {
                subject: {
                  ...task.subject,
                  submissionId: task.subject.submissionId.replace(/^speaker-submission:/u, ""),
                },
              }
            : {}),
        };
        tasks.push(stored);
        return { ok: true, value: structuredClone(stored) };
      },
      transitionTask: async () => ({ ok: false, reason: "not_found" }),
      createPendingAsset: async (asset) => asset,
      getAsset: async () => null,
    };
    const service = new SpeakerService(repository, {} as never, {
      speakerSender: "speakers@example.test",
      now: () => new Date("2026-08-15T13:00:00.000Z"),
      generateId: () => "task-organizer-1",
    });
    const routes = createSpeakerRoutes({
      service,
      authenticate: async () => ({ accountId: "organizer-1" }),
    });

    const response = await routes.request("/events/event-1/organizer/tasks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: "action",
        title: "Confirm participation",
        allowedMimeTypes: ["application/pdf"],
        assignments: [{ participantId: "participant-priya", submissionId: "submission-accepted" }],
      }),
    });

    const responseBody = (await response.json()) as Record<string, unknown>;
    expect({ status: response.status, body: responseBody }).toMatchObject({
      status: 201,
      body: {
        data: {
          id: "task-organizer-1",
          participantId: "participant-priya",
          submissionId: "submission-accepted",
          version: 1,
        },
      },
    });
    expect(tasks).toHaveLength(1);
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

  it("reads the published task form and ordered immutable response history in event tenant scope", async () => {
    const database = new SpeakerWorkflowD1({
      speaker_task_forms: [
        {
          id: "task-1",
          event_id: "event-1",
          task_id: "task-1",
          title: "Speaker details",
          description: "Tell us about the session.",
          fields_json: JSON.stringify([{ id: "bio", label: "Biography", type: "textarea" }]),
          version: 2,
          published: 1,
          updated_at: "2026-08-13T10:00:00.000Z",
        },
      ],
      speaker_task_responses: [
        {
          id: "response-1",
          event_id: "event-1",
          task_id: "task-1",
          participant_id: "participant-1",
          definition_version: 2,
          answers_json: JSON.stringify({ bio: "First" }),
          status: "draft",
          version: 1,
          feedback: null,
          submitted_at: null,
          updated_at: "2026-08-13T11:00:00.000Z",
        },
        {
          id: "response-2",
          event_id: "event-1",
          task_id: "task-1",
          participant_id: "participant-1",
          definition_version: 2,
          answers_json: JSON.stringify({ bio: "Second" }),
          status: "submitted",
          version: 2,
          feedback: "Looks good",
          submitted_at: "2026-08-13T12:00:00.000Z",
          updated_at: "2026-08-13T12:00:00.000Z",
        },
      ],
    });
    const repository = new D1SpeakerRepository(database as unknown as D1Database);

    await expect(repository.getTaskForm?.("event-1", "task-1")).resolves.toEqual({
      id: "task-1",
      eventId: "event-1",
      taskId: "task-1",
      title: "Speaker details",
      description: "Tell us about the session.",
      fields: [{ id: "bio", label: "Biography", type: "textarea" }],
      version: 2,
      published: true,
      updatedAt: "2026-08-13T10:00:00.000Z",
    });
    await expect(
      repository.listTaskResponses?.("event-1", "task-1", "participant-1"),
    ).resolves.toEqual([
      expect.objectContaining({ id: "response-1", version: 1, answers: { bio: "First" } }),
      expect.objectContaining({
        id: "response-2",
        version: 2,
        answers: { bio: "Second" },
        feedback: "Looks good",
      }),
    ]);
    expect(database.reads).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sql: expect.stringContaining("published = 1"),
          values: ["org-1", "event-1", "task-1"],
        }),
        expect.objectContaining({
          sql: expect.stringContaining("ORDER BY version ASC"),
          values: ["org-1", "event-1", "task-1", "participant-1"],
        }),
      ]),
    );
  });

  it("saves task responses as optimistic immutable versions", async () => {
    const response: SpeakerTaskResponseRecord = {
      id: "response-2",
      eventId: "event-1",
      taskId: "task-1",
      participantId: "participant-1",
      definitionVersion: 2,
      answers: { bio: "Updated" },
      status: "draft",
      version: 2,
      updatedAt: "2026-08-13T12:00:00.000Z",
    };
    const successDatabase = new SpeakerWorkflowD1({}, [1]);
    const successRepository = new D1SpeakerRepository(successDatabase as unknown as D1Database);

    await expect(successRepository.saveTaskResponse?.(response, 1)).resolves.toEqual({
      ok: true,
      value: response,
    });
    expect(successDatabase.runs[0]?.sql).toContain("INSERT INTO speaker_task_responses");
    expect(successDatabase.runs[0]?.sql).toContain("MAX(version)");
    expect(successDatabase.runs[0]?.sql).not.toContain("UPDATE speaker_task_responses");

    const staleDatabase = new SpeakerWorkflowD1({}, [0]);
    const staleRepository = new D1SpeakerRepository(staleDatabase as unknown as D1Database);
    await expect(staleRepository.saveTaskResponse?.(response, 1)).resolves.toEqual({
      ok: false,
      reason: "version_conflict",
    });
  });

  it("lists asset versions and version comments deterministically without server-only authors", async () => {
    const database = new SpeakerWorkflowD1({
      speaker_assets: [
        {
          id: "asset-v1",
          organization_id: "org-1",
          event_id: "event-1",
          submission_id: null,
          participant_id: "participant-1",
          task_id: "task-1",
          kind: "slides",
          object_key: "private/v1",
          file_name: "slides-v1.pdf",
          content_type: "application/pdf",
          size_bytes: 100,
          state: "ready",
          version: 1,
          version_family_id: "asset-family",
          supersedes_asset_id: null,
          comment_thread_id: "asset-thread:asset-family",
          review_state: null,
          review_note: null,
          reviewed_at: null,
          reviewed_by: null,
          review_version: 0,
          latest_version_id: "asset-v2",
          current_version_id: "asset-v2",
          approved_version_id: null,
          released_version_id: null,
          rejection_reason: null,
          created_at: "2026-08-13T10:00:00.000Z",
          finalized_at: "2026-08-13T10:01:00.000Z",
        },
      ],
      speaker_asset_comments: [
        {
          id: "comment-1",
          event_id: "event-1",
          asset_id: "asset-v1",
          version_id: "asset-v1",
          body: "Please update the footer.",
          author_label: "Organizer",
          author_account_id: "organizer-secret",
          version: 1,
          created_at: "2026-08-13T11:00:00.000Z",
          updated_at: "2026-08-13T11:00:00.000Z",
        },
      ],
    });
    const repository = new D1SpeakerRepository(database as unknown as D1Database);

    await expect(repository.listAssetHistory?.("event-1", "asset-family")).resolves.toEqual([
      expect.objectContaining({ id: "asset-v1", version: 1, versionFamilyId: "asset-family" }),
    ]);
    await expect(repository.listAssetComments?.("event-1", "asset-v1")).resolves.toEqual([
      {
        id: "comment-1",
        eventId: "event-1",
        assetId: "asset-v1",
        versionId: "asset-v1",
        body: "Please update the footer.",
        authorLabel: "Organizer",
        createdAt: "2026-08-13T11:00:00.000Z",
        updatedAt: "2026-08-13T11:00:00.000Z",
        version: 1,
      },
    ]);
    expect(database.reads).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sql: expect.stringContaining("ORDER BY version ASC, created_at ASC, id ASC"),
          values: ["org-1", "event-1", "asset-family"],
        }),
        expect.objectContaining({
          sql: expect.stringContaining("author_label <> ?"),
          values: ["org-1", "event-1", "asset-v1", "asset-v1", "__speaker_asset_audit__"],
        }),
      ]),
    );
  });

  it("creates version-specific comments in the asset tenant and reads published resources only", async () => {
    const database = new SpeakerWorkflowD1({
      speaker_assets: [
        {
          id: "asset-v1",
          organization_id: "org-1",
          event_id: "event-1",
          participant_id: "participant-1",
        },
      ],
      speaker_event_resources: [
        {
          id: "resource-1",
          event_id: "event-1",
          title: "Guide",
          summary: null,
          html: '<p onclick="bad()">Stored HTML</p>',
          url: "https://docs.example.test/guide",
          sort_order: 1,
          updated_at: "2026-08-13T10:00:00.000Z",
        },
      ],
      speaker_wiki_pages: [
        {
          id: "wiki-1",
          event_id: "event-1",
          title: "Welcome",
          slug: "welcome",
          summary: "Start here",
          html: null,
          url: null,
          sort_order: 0,
          updated_at: "2026-08-13T10:00:00.000Z",
        },
      ],
    });
    const repository = new D1SpeakerRepository(database as unknown as D1Database);
    const comment = {
      id: "comment-1",
      eventId: "event-1",
      assetId: "asset-v1",
      versionId: "asset-v1",
      body: "New comment",
      authorLabel: "Organizer",
      authorAccountId: "organizer-1",
      version: 1,
      createdAt: "2026-08-13T11:00:00.000Z",
      updatedAt: "2026-08-13T11:00:00.000Z",
    };

    await expect(repository.createAssetComment?.(comment)).resolves.toEqual(comment);
    expect(database.runs[0]).toMatchObject({
      sql: expect.stringContaining("INSERT INTO speaker_asset_comments"),
      values: expect.arrayContaining(["org-1", "event-1", "asset-v1", "asset-v1"]),
    });
    await expect(repository.listEventResources?.("event-1")).resolves.toEqual([
      {
        id: "resource-1",
        eventId: "event-1",
        title: "Guide",
        html: '<p onclick="bad()">Stored HTML</p>',
        url: "https://docs.example.test/guide",
        order: 1,
        updatedAt: "2026-08-13T10:00:00.000Z",
      },
    ]);
    await expect(repository.listWikiPages?.("event-1")).resolves.toEqual([
      {
        id: "wiki-1",
        eventId: "event-1",
        title: "Welcome",
        slug: "welcome",
        summary: "Start here",
        order: 0,
        updatedAt: "2026-08-13T10:00:00.000Z",
      },
    ]);
    expect(database.reads).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sql: expect.stringContaining("status = 'published'"),
          values: ["org-1", "event-1"],
        }),
      ]),
    );
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
