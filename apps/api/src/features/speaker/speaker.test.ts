import { describe, expect, it } from "vitest";
import { createSpeakerRoutes } from "./routes";
import { SpeakerService, SpeakerServiceError } from "./service";
import type {
  CreatePrivateUploadGrantCommand,
  PrivateAssetGateway,
  PrivateDownloadGrant,
  PrivateUploadGrant,
  RepositoryResult,
  SpeakerAccessScope,
  SpeakerAsset,
  SpeakerAssetComment,
  SpeakerEventResource,
  SpeakerOrganizerAccessScope,
  SpeakerPortalContext,
  SpeakerProfile,
  SpeakerRepository,
  SpeakerRosterEntry,
  SpeakerSubmission,
  SpeakerTask,
  SpeakerTaskRepositoryCommand,
  SpeakerTaskTransition,
  SpeakerWikiPage,
  TransitionSpeakerTaskCommand,
  UpdateBiographyCommand,
} from "./types";

class FakeSpeakerRepository implements SpeakerRepository {
  readonly scopes = new Map<string, SpeakerAccessScope>();
  readonly submissions: SpeakerSubmission[] = [];
  readonly profiles: SpeakerProfile[] = [];
  readonly tasks: SpeakerTask[] = [];
  readonly assets: SpeakerAsset[] = [];
  readonly comments: SpeakerAssetComment[] = [];
  readonly transitions: SpeakerTaskTransition[] = [];

  getAccessScope(eventId: string, accountId: string): Promise<SpeakerAccessScope> {
    return Promise.resolve(
      this.scopes.get(`${eventId}:${accountId}`) ?? { submissionIds: [], participantIds: [] },
    );
  }

  listSubmissions(eventId: string, submissionIds: readonly string[]): Promise<SpeakerSubmission[]> {
    return Promise.resolve(
      this.submissions.filter(
        (submission) => submission.eventId === eventId && submissionIds.includes(submission.id),
      ),
    );
  }

  getSubmission(eventId: string, submissionId: string): Promise<SpeakerSubmission | null> {
    return Promise.resolve(
      this.submissions.find(
        (submission) => submission.eventId === eventId && submission.id === submissionId,
      ) ?? null,
    );
  }

  listProfiles(eventId: string, participantIds: readonly string[]): Promise<SpeakerProfile[]> {
    return Promise.resolve(
      this.profiles.filter(
        (profile) => profile.eventId === eventId && participantIds.includes(profile.participantId),
      ),
    );
  }

  getProfile(eventId: string, participantId: string): Promise<SpeakerProfile | null> {
    return Promise.resolve(
      this.profiles.find(
        (profile) => profile.eventId === eventId && profile.participantId === participantId,
      ) ?? null,
    );
  }

  updateBiography(command: UpdateBiographyCommand): Promise<RepositoryResult<SpeakerProfile>> {
    const index = this.profiles.findIndex(
      (profile) =>
        profile.eventId === command.eventId && profile.participantId === command.participantId,
    );
    const profile = this.profiles[index];
    if (!profile) {
      return Promise.resolve({ ok: false, reason: "not_found" });
    }
    if (profile.version !== command.expectedVersion) {
      return Promise.resolve({ ok: false, reason: "version_conflict" });
    }
    const updated: SpeakerProfile = {
      ...profile,
      biography: command.biography,
      version: profile.version + 1,
      updatedAt: command.updatedAt,
    };
    this.profiles[index] = updated;
    return Promise.resolve({ ok: true, value: updated });
  }

  listTasks(eventId: string, participantIds: readonly string[]): Promise<SpeakerTask[]> {
    return Promise.resolve(
      this.tasks.filter(
        (task) => task.eventId === eventId && participantIds.includes(task.participantId),
      ),
    );
  }

  getTask(eventId: string, taskId: string): Promise<SpeakerTask | null> {
    return Promise.resolve(
      this.tasks.find((task) => task.eventId === eventId && task.id === taskId) ?? null,
    );
  }

  getTasksByIds(eventId: string, taskIds: readonly string[]): Promise<SpeakerTask[]> {
    return Promise.resolve(
      this.tasks.filter((task) => task.eventId === eventId && taskIds.includes(task.id)),
    );
  }

  transitionTask(
    command: TransitionSpeakerTaskCommand,
  ): Promise<RepositoryResult<{ task: SpeakerTask; transition: SpeakerTaskTransition }>> {
    const index = this.tasks.findIndex(
      (task) => task.eventId === command.eventId && task.id === command.taskId,
    );
    const task = this.tasks[index];
    if (!task) {
      return Promise.resolve({ ok: false, reason: "not_found" });
    }
    if (task.version !== command.expectedVersion) {
      return Promise.resolve({ ok: false, reason: "version_conflict" });
    }
    if (task.status !== command.fromStatus) {
      return Promise.resolve({ ok: false, reason: "invalid_state" });
    }
    const updated: SpeakerTask = {
      ...task,
      status: command.toStatus,
      version: task.version + 1,
      updatedAt: command.transition.occurredAt,
    };
    this.tasks[index] = updated;
    this.transitions.push(command.transition);
    return Promise.resolve({
      ok: true,
      value: { task: updated, transition: command.transition },
    });
  }

  createPendingAsset(asset: SpeakerAsset): Promise<SpeakerAsset> {
    this.assets.push(asset);
    return Promise.resolve(asset);
  }

  getAsset(eventId: string, assetId: string): Promise<SpeakerAsset | null> {
    return Promise.resolve(
      this.assets.find((asset) => asset.eventId === eventId && asset.id === assetId) ?? null,
    );
  }
  listAssetComments(eventId: string, assetId: string): Promise<SpeakerAssetComment[]> {
    return Promise.resolve(
      this.comments.filter((comment) => comment.eventId === eventId && comment.assetId === assetId),
    );
  }

  createAssetComment(comment: SpeakerAssetComment): Promise<SpeakerAssetComment> {
    this.comments.push(comment);
    return Promise.resolve(comment);
  }
}
class OrganizerSpeakerRepository extends FakeSpeakerRepository {
  readonly organizerScopes = new Map<string, SpeakerOrganizerAccessScope>();
  readonly verifiedEmails = new Map<string, string>();
  readonly roster: SpeakerRosterEntry[] = [];
  rosterEventReads = 0;

  getOrganizerAccessScope(
    eventId: string,
    accountId: string,
  ): Promise<SpeakerOrganizerAccessScope | null> {
    return Promise.resolve(this.organizerScopes.get(`${eventId}:${accountId}`) ?? null);
  }

  findAcceptedParticipantByEmail(
    eventId: string,
    submissionIds: readonly string[],
    email: string,
  ): Promise<{ participantId: string; submissionId: string; email: string } | null> {
    const normalizedEmail = email.trim().toLowerCase();
    const matches = this.submissions.flatMap((candidate) => {
      if (
        candidate.eventId !== eventId ||
        candidate.status !== "accepted" ||
        !submissionIds.some(
          (allowed) =>
            allowed === candidate.id ||
            allowed === `speaker-submission:${candidate.id}` ||
            candidate.id === `speaker-submission:${allowed}`,
        )
      ) {
        return [];
      }
      return candidate.participantIds
        .filter((participantId) => this.verifiedEmails.get(participantId) === normalizedEmail)
        .map((participantId) => ({
          participantId,
          submissionId: candidate.id,
          email: normalizedEmail,
        }));
    });
    return Promise.resolve(matches.length === 1 ? (matches[0] ?? null) : null);
  }

  listRoster(eventId: string, submissionId: string): Promise<SpeakerRosterEntry[]> {
    return Promise.resolve(
      this.roster.filter(
        (entry) =>
          entry.eventId === eventId &&
          (entry.submissionId === submissionId ||
            entry.submissionId === `speaker-submission:${submissionId}` ||
            submissionId === `speaker-submission:${entry.submissionId}`),
      ),
    );
  }
  listRosterForEvent(eventId: string): Promise<SpeakerRosterEntry[]> {
    this.rosterEventReads += 1;
    return Promise.resolve(this.roster.filter((entry) => entry.eventId === eventId));
  }

  saveRoster(
    entry: SpeakerRosterEntry,
    expectedVersion: number | null,
  ): Promise<RepositoryResult<SpeakerRosterEntry>> {
    const index = this.roster.findIndex((candidate) => candidate.id === entry.id);
    if (expectedVersion === null) {
      if (index >= 0) return Promise.resolve({ ok: false, reason: "version_conflict" });
      this.roster.push(entry);
      return Promise.resolve({ ok: true, value: entry });
    }
    if (index < 0) return Promise.resolve({ ok: false, reason: "not_found" });
    const current = this.roster[index];
    if (current === undefined || current.version !== expectedVersion) {
      return Promise.resolve({ ok: false, reason: "version_conflict" });
    }
    this.roster[index] = entry;
    return Promise.resolve({ ok: true, value: entry });
  }

  createTask(command: SpeakerTaskRepositoryCommand): Promise<RepositoryResult<SpeakerTask>> {
    if (command.expectedVersion !== null) {
      return Promise.resolve({ ok: false, reason: "version_conflict" });
    }
    this.tasks.push(command.task);
    return Promise.resolve({ ok: true, value: command.task });
  }
}
class ConcurrentOrganizerRepository extends OrganizerSpeakerRepository {
  submissionReads = 0;
  readonly started = new Set<string>();
  readonly #releases = new Map<string, () => void>();

  private hold<T>(name: string, read: () => Promise<T>): Promise<T> {
    this.started.add(name);
    return new Promise<T>((resolve, reject) => {
      this.#releases.set(name, () => {
        void read().then(resolve, reject);
      });
    });
  }

  releaseReads(): void {
    for (const release of this.#releases.values()) release();
    this.#releases.clear();
  }
  override listSubmissions(
    eventId: string,
    submissionIds: readonly string[],
  ): Promise<SpeakerSubmission[]> {
    this.submissionReads += 1;
    return super.listSubmissions(eventId, submissionIds);
  }

  override listProfiles(
    eventId: string,
    participantIds: readonly string[],
  ): Promise<SpeakerProfile[]> {
    return this.hold("profiles", () => super.listProfiles(eventId, participantIds));
  }

  listAssets(eventId: string, participantIds: readonly string[]): Promise<SpeakerAsset[]> {
    return this.hold("assets", async () =>
      this.assets.filter(
        (asset) => asset.eventId === eventId && participantIds.includes(asset.participantId),
      ),
    );
  }

  override listRosterForEvent(eventId: string): Promise<SpeakerRosterEntry[]> {
    return this.hold("roster", () => super.listRosterForEvent(eventId));
  }
}

class CountingPortalRepository extends OrganizerSpeakerRepository {
  readonly portalContexts: SpeakerPortalContext[] = [];
  readonly resources: SpeakerEventResource[] = [];
  readonly wiki: SpeakerWikiPage[] = [];
  accessScopeReads = 0;
  submissionReads = 0;
  profileReads = 0;
  taskReads = 0;
  contextReads = 0;
  assetReads = 0;
  rosterReads = 0;
  resourceReads = 0;
  wikiReads = 0;

  override getAccessScope(eventId: string, accountId: string): Promise<SpeakerAccessScope> {
    this.accessScopeReads += 1;
    return super.getAccessScope(eventId, accountId);
  }

  override listSubmissions(
    eventId: string,
    submissionIds: readonly string[],
  ): Promise<SpeakerSubmission[]> {
    this.submissionReads += 1;
    return super.listSubmissions(eventId, submissionIds);
  }

  override listProfiles(
    eventId: string,
    participantIds: readonly string[],
  ): Promise<SpeakerProfile[]> {
    this.profileReads += 1;
    return super.listProfiles(eventId, participantIds);
  }

  override listTasks(eventId: string, participantIds: readonly string[]): Promise<SpeakerTask[]> {
    this.taskReads += 1;
    return super.listTasks(eventId, participantIds);
  }

  listPortalContexts(accountId: string): Promise<SpeakerPortalContext[]> {
    this.contextReads += 1;
    return Promise.resolve(accountId === "account-1" ? this.portalContexts : []);
  }

  listAssets(eventId: string, participantIds: readonly string[]): Promise<SpeakerAsset[]> {
    this.assetReads += 1;
    return Promise.resolve(
      this.assets.filter(
        (asset) => asset.eventId === eventId && participantIds.includes(asset.participantId),
      ),
    );
  }

  listRoster(eventId: string, submissionId: string): Promise<SpeakerRosterEntry[]> {
    this.rosterReads += 1;
    return super.listRoster(eventId, submissionId);
  }

  listEventResources(eventId: string): Promise<SpeakerEventResource[]> {
    this.resourceReads += 1;
    return Promise.resolve(this.resources.filter((resource) => resource.eventId === eventId));
  }

  listWikiPages(eventId: string): Promise<SpeakerWikiPage[]> {
    this.wikiReads += 1;
    return Promise.resolve(this.wiki.filter((page) => page.eventId === eventId));
  }
}

class FakePrivateAssetGateway implements PrivateAssetGateway {
  readonly uploads: CreatePrivateUploadGrantCommand[] = [];
  readonly downloads: { objectKey: string; fileName: string; expiresAt: string }[] = [];

  createUploadGrant(command: CreatePrivateUploadGrantCommand): Promise<PrivateUploadGrant> {
    this.uploads.push(command);
    return Promise.resolve({
      method: "PUT",
      url: `https://private-upload.invalid/${encodeURIComponent(command.objectKey)}`,
      headers: { "content-type": command.contentType },
      expiresAt: command.expiresAt,
    });
  }

  createDownloadGrant(command: {
    objectKey: string;
    fileName: string;
    expiresAt: string;
  }): Promise<PrivateDownloadGrant> {
    this.downloads.push(command);
    return Promise.resolve({
      url: `https://private-download.invalid/${encodeURIComponent(command.objectKey)}`,
      expiresAt: command.expiresAt,
    });
  }
}

const now = "2026-08-08T12:00:00.000Z";

function submission(
  id: string,
  participantId: string,
  status: SpeakerSubmission["status"] = "accepted",
  eventId = "event-1",
): SpeakerSubmission {
  return {
    id,
    eventId,
    title: `Submission ${id}`,
    status,
    participantIds: [participantId],
    updatedAt: now,
  };
}

function profile(participantId: string, eventId = "event-1"): SpeakerProfile {
  return {
    id: `profile-${participantId}`,
    eventId,
    participantId,
    displayName: `Speaker ${participantId}`,
    biography: "Original biography",
    version: 3,
    updatedAt: now,
  };
}

function task(
  input: Partial<SpeakerTask> & Pick<SpeakerTask, "id" | "participantId">,
): SpeakerTask {
  return {
    eventId: "event-1",
    submissionId: "submission-1",
    type: "upload",
    owner: "speaker",
    title: `Task ${input.id}`,
    status: "not_started",
    dependencyIds: [],
    reminderOffsetsMinutes: [],
    version: 0,
    updatedAt: now,
    ...input,
  };
}

function createFixture() {
  const repository = new FakeSpeakerRepository();
  const gateway = new FakePrivateAssetGateway();
  repository.scopes.set("event-1:account-1", {
    submissionIds: ["submission-1", "submission-declined"],
    participantIds: ["participant-1"],
    capabilities: [
      "profile-self",
      "task-response",
      "asset-read",
      "asset-write",
      "asset-comment",
      "resource-read",
    ],
  });
  repository.scopes.set("event-1:account-2", {
    submissionIds: ["submission-2"],
    participantIds: ["participant-2"],
    capabilities: [],
  });
  repository.scopes.set("event-2:account-1", {
    submissionIds: ["submission-other-event"],
    participantIds: ["participant-other-event"],
    capabilities: [],
  });
  repository.submissions.push(
    submission("submission-1", "participant-1"),
    submission("submission-2", "participant-2"),
    submission("submission-declined", "participant-1", "declined"),
    submission("submission-other-event", "participant-other-event", "accepted", "event-2"),
  );
  repository.profiles.push(
    profile("participant-1"),
    profile("participant-2"),
    profile("participant-other-event", "event-2"),
  );
  repository.tasks.push(
    task({ id: "dependency", participantId: "participant-1", status: "completed" }),
    task({
      id: "slides-task",
      participantId: "participant-1",
      dependencyIds: ["dependency"],
      acceptedAssetKinds: ["slides"],
    }),
    task({ id: "action-task", participantId: "participant-1", type: "action" }),
    task({
      id: "organizer-task",
      participantId: "participant-1",
      owner: "organizer",
      type: "action",
    }),
    task({
      id: "declined-task",
      participantId: "participant-1",
      submissionId: "submission-declined",
    }),
    task({
      id: "other-speaker-task",
      participantId: "participant-2",
      submissionId: "submission-2",
    }),
    task({
      id: "other-event-task",
      participantId: "participant-other-event",
      submissionId: "submission-other-event",
      eventId: "event-2",
    }),
  );

  let sequence = 0;
  const service = new SpeakerService(repository, gateway, {
    now: () => new Date(now),
    generateId: () => `generated-${++sequence}`,
  });
  return { repository, gateway, service };
}
function createOrganizerFixture() {
  const repository = new OrganizerSpeakerRepository();
  repository.organizerScopes.set("event-1:account-1", {
    tenantId: "org-1",
    eventId: "event-1",
    role: "owner",
    submissionIds: ["submission-1", "submission-2"],
    participantIds: ["participant-1", "participant-2"],
  });
  repository.submissions.push(
    submission("submission-1", "participant-1"),
    submission("submission-2", "participant-2"),
  );
  repository.verifiedEmails.set("participant-1", "priya@example.test");
  repository.verifiedEmails.set("participant-2", "marcus@example.test");
  let sequence = 0;
  const gateway = new FakePrivateAssetGateway();
  const service = new SpeakerService(repository, gateway, {
    now: () => new Date(now),
    generateId: () => `generated-${++sequence}`,
  });
  return { repository, gateway, service };
}
function createConcurrentOrganizerFixture() {
  const repository = new ConcurrentOrganizerRepository();
  repository.organizerScopes.set("event-1:account-1", {
    tenantId: "org-1",
    eventId: "event-1",
    role: "owner",
    submissionIds: ["submission-1", "submission-declined"],
    participantIds: ["participant-1"],
  });
  repository.submissions.push(
    { ...submission("submission-1", "participant-1"), title: "Canonical session" },
    submission("submission-declined", "participant-1", "declined"),
  );
  repository.profiles.push({ ...profile("participant-1"), displayName: "Profile name" });
  repository.roster.push({
    id: "roster:event-1:speaker-submission:submission-1:participant-1",
    eventId: "event-1",
    submissionId: "speaker-submission:submission-1",
    participantId: "participant-1",
    displayName: "Roster name",
    role: "primary",
    status: "active",
    version: 1,
    createdAt: now,
    updatedAt: now,
  });
  repository.assets.push({
    id: "asset-concurrent",
    tenantId: "org-1",
    eventId: "event-1",
    submissionId: "speaker-submission:submission-1",
    participantId: "participant-1",
    kind: "slides",
    objectKey: "events/event-1/participants/participant-1/slides/asset-concurrent",
    fileName: "slides.pdf",
    contentType: "application/pdf",
    sizeBytes: 1_024,
    state: "ready",
    createdAt: now,
  });
  const service = new SpeakerService(repository, new FakePrivateAssetGateway(), {
    now: () => new Date(now),
  });
  return { repository, service };
}
function createDualRoleFixture() {
  const { repository, service } = createOrganizerFixture();
  repository.scopes.set("event-1:account-1", {
    tenantId: "org-1",
    submissionIds: ["submission-1"],
    participantIds: ["participant-1"],
    capabilities: ["asset-read", "task-response"],
  });
  repository.profiles.push(profile("participant-1"), profile("participant-2"));
  repository.tasks.push(
    task({ id: "dual-role-task-1", participantId: "participant-1" }),
    task({
      id: "dual-role-task-2",
      participantId: "participant-2",
      submissionId: "submission-2",
    }),
  );
  repository.assets.push(
    {
      id: "dual-role-asset-1",
      tenantId: "org-1",
      eventId: "event-1",
      submissionId: "submission-1",
      participantId: "participant-1",
      kind: "slides",
      objectKey: "events/event-1/participants/participant-1/slides/dual-role-asset-1",
      fileName: "participant-1.pdf",
      contentType: "application/pdf",
      sizeBytes: 1_024,
      state: "ready",
      createdAt: now,
    },
    {
      id: "dual-role-asset-2",
      tenantId: "org-1",
      eventId: "event-1",
      submissionId: "submission-2",
      participantId: "participant-2",
      kind: "slides",
      objectKey: "events/event-1/participants/participant-2/slides/dual-role-asset-2",
      fileName: "participant-2.pdf",
      contentType: "application/pdf",
      sizeBytes: 1_024,
      state: "ready",
      createdAt: now,
    },
  );
  repository.comments.push(
    {
      id: "dual-role-comment-1",
      eventId: "event-1",
      assetId: "dual-role-asset-1",
      body: "Participant one comment",
      authorLabel: "Speaker",
      createdAt: now,
      version: 1,
    },
    {
      id: "dual-role-comment-2",
      eventId: "event-1",
      assetId: "dual-role-asset-2",
      body: "Participant two comment",
      authorLabel: "Speaker",
      createdAt: now,
      version: 1,
    },
  );
  return { repository, service };
}
describe("SpeakerService organizer asset reads", () => {
  it("starts asset, profile, and roster reads together and preserves canonical metadata", async () => {
    const { repository, service } = createConcurrentOrganizerFixture();
    const pending = service.listOrganizerAssets("event-1", "account-1");

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(repository.started).toEqual(new Set(["assets", "profiles", "roster"]));
    expect(repository.submissionReads).toBe(1);

    repository.releaseReads();
    await expect(pending).resolves.toEqual([
      expect.objectContaining({
        id: "asset-concurrent",
        participantName: "Profile name",
        sessionTitle: "Canonical session",
      }),
    ]);
  });

  it("keeps organizer assets bounded to accepted submissions and the authorized tenant", async () => {
    const { repository, service } = createConcurrentOrganizerFixture();
    repository.assets.push(
      {
        id: "asset-other-tenant",
        tenantId: "other-org",
        eventId: "event-1",
        submissionId: "submission-1",
        participantId: "participant-1",
        kind: "slides",
        objectKey: "events/event-1/other/asset-other-tenant",
        fileName: "other.pdf",
        contentType: "application/pdf",
        sizeBytes: 1,
        state: "ready",
        createdAt: now,
      },
      {
        id: "asset-other-event",
        tenantId: "org-1",
        eventId: "event-2",
        submissionId: "submission-1",
        participantId: "participant-1",
        kind: "slides",
        objectKey: "events/event-2/asset-other-event",
        fileName: "other-event.pdf",
        contentType: "application/pdf",
        sizeBytes: 1,
        state: "ready",
        createdAt: now,
      },
      {
        id: "asset-declined",
        tenantId: "org-1",
        eventId: "event-1",
        submissionId: "submission-declined",
        participantId: "participant-1",
        kind: "slides",
        objectKey: "events/event-1/asset-declined",
        fileName: "declined.pdf",
        contentType: "application/pdf",
        sizeBytes: 1,
        state: "ready",
        createdAt: now,
      },
    );

    const pending = service.listOrganizerAssets("event-1", "account-1");
    await new Promise((resolve) => setTimeout(resolve, 0));
    repository.releaseReads();
    await expect(pending).resolves.toEqual([expect.objectContaining({ id: "asset-concurrent" })]);
  });
});
describe("SpeakerService organizer speaker writes", () => {
  it("replays manual saves by canonical identity and returns the task envelope", async () => {
    const { repository, service } = createOrganizerFixture();
    const baseInput = {
      organizationId: "org-1",
      eventId: "event-1",
      accountId: "account-1",
      jobTitle: "Principal Engineer",
      company: "Latticework Systems",
      biography: "Builds reliable developer platforms.",
      socialLinks: {},
      status: "pending",
    } as const;
    const first = await service.createOrganizerSpeaker({
      ...baseInput,
      displayName: "Priya Raman",
      email: "PRIYA@example.test",
      idempotencyKey: "manual-priya",
    });
    const replay = await service.createOrganizerSpeaker({
      ...baseInput,
      displayName: "Priya Raman",
      email: "priya@example.test",
      idempotencyKey: "manual-priya",
    });
    const second = await service.createOrganizerSpeaker({
      ...baseInput,
      displayName: "Marcus Okafor",
      email: "marcus@example.test",
      idempotencyKey: "manual-marcus",
    });
    expect(first.speakers.map((speaker) => speaker.participantId)).toEqual(["participant-1"]);
    expect(replay.speakers.map((speaker) => speaker.participantId)).toEqual(["participant-1"]);
    expect(new Set(second.speakers.map((speaker) => speaker.participantId))).toEqual(
      new Set(["participant-1", "participant-2"]),
    );
    expect(repository.roster).toHaveLength(2);
    expect(repository.roster.map((entry) => entry.submissionId)).toEqual([
      "speaker-submission:submission-1",
      "speaker-submission:submission-2",
    ]);

    const taskEnvelope = await service.assignOrganizerSpeakerTask({
      organizationId: "org-1",
      eventId: "event-1",
      accountId: "account-1",
      title: "Confirm participation",
      description: "General speaker onboarding task.",
      dueAt: "2027-04-01",
      participantIds: ["participant-1", "participant-2"],
    });
    expect(taskEnvelope.tasks.map((task) => task.participantId)).toEqual([
      "participant-1",
      "participant-2",
    ]);
    expect(taskEnvelope.organizationId).toBe("org-1");
    expect(taskEnvelope.eventId).toBe("event-1");
  });
  it("does not create organizer tasks from stale profile projections", async () => {
    const { repository, service } = createOrganizerFixture();
    repository.organizerScopes.set("event-1:account-1", {
      tenantId: "org-1",
      eventId: "event-1",
      role: "owner",
      submissionIds: ["submission-1", "submission-2", "stale-submission"],
      participantIds: ["participant-1", "participant-2", "participant-stale"],
    });
    repository.profiles.push(profile("participant-stale"));
    const legacySubmission = repository.submissions.find(
      (candidate) => candidate.id === "submission-1",
    );
    if (legacySubmission === undefined) throw new Error("Expected the legacy submission fixture.");
    legacySubmission.title = legacySubmission.id;
    repository.submissions.push({
      ...submission("speaker-submission:submission-1", "participant-1"),
      title: "Descriptive accepted session",
    });

    expect(
      (await service.listOrganizerProfiles("event-1", "account-1")).map(
        (candidate) => candidate.participantId,
      ),
    ).toEqual([]);

    await expect(
      service.createOrganizerTask({
        eventId: "event-1",
        accountId: "account-1",
        type: "action",
        title: "Stale assignment",
        description: "Must not be assigned.",
        dueAt: "2027-04-01",
        assigneeIds: ["participant-stale"],
      }),
    ).rejects.toSatisfy((error: unknown) => {
      expectServiceError(error, "NOT_FOUND");
      return true;
    });

    const [task] = await service.createOrganizerTask({
      eventId: "event-1",
      accountId: "account-1",
      type: "action",
      title: "Canonical assignment",
      description: "Use the accepted submission.",
      dueAt: "2027-04-01",
      submissionId: "submission-1",
      assigneeIds: ["participant-1"],
    });
    expect(task?.submissionId).toBe("speaker-submission:submission-1");
    expect(
      (await service.listOrganizerTasks("event-1", "account-1")).find(
        (candidate) => candidate.id === task?.id,
      )?.sessionTitle,
    ).toBe("Descriptive accepted session");
  });

  it("consolidates duplicate verified-email projections and counts only general action tasks", async () => {
    const { repository, service } = createOrganizerFixture();
    const firstSubmission = repository.submissions[0];
    const secondSubmission = repository.submissions[1];
    if (firstSubmission === undefined || secondSubmission === undefined) {
      throw new Error("The organizer fixture requires two accepted submissions.");
    }
    repository.submissions.splice(
      0,
      2,
      { ...firstSubmission, title: "Shared accepted session" },
      { ...secondSubmission, title: "Shared accepted session" },
    );
    repository.profiles.push(
      {
        ...profile("participant-1"),
        displayName: "Priya Raman",
        email: "priya@example.test",
        version: 1,
      },
      {
        ...profile("participant-2"),
        displayName: "Priya Raman",
        email: "PRIYA@example.test",
        version: 4,
        updatedAt: "2026-08-09T12:00:00.000Z",
      },
    );
    repository.tasks.push(
      task({
        id: "general-complete-1",
        participantId: "participant-1",
        type: "action",
        status: "completed",
      }),
      task({
        id: "general-complete-2",
        participantId: "participant-1",
        type: "action",
        status: "completed",
      }),
      task({
        id: "general-pending",
        participantId: "participant-1",
        type: "action",
      }),
      task({
        id: "file-request",
        participantId: "participant-1",
        type: "upload",
      }),
      task({
        id: "profile-form",
        participantId: "participant-2",
        submissionId: "submission-2",
        type: "form",
        status: "submitted",
      }),
    );

    const roster = await service.listOrganizerSpeakerRoster("org-1", "event-1", "account-1");

    expect(roster.speakers).toHaveLength(1);
    expect(roster.speakers[0]).toMatchObject({
      participantId: "participant-2",
      displayName: "Priya Raman",
      taskSummary: { total: 3, completed: 2, overdue: 0 },
    });
    expect(roster.speakers[0]?.sessions).toHaveLength(1);
    expect(repository.rosterEventReads).toBe(1);
  });
  it("does not issue download grants while constructing the organizer roster", async () => {
    const { repository, gateway, service } = createOrganizerFixture();
    repository.profiles.push(profile("participant-1"));
    repository.assets.push(
      {
        id: "roster-ready-asset",
        tenantId: "org-1",
        eventId: "event-1",
        submissionId: "submission-1",
        participantId: "participant-1",
        kind: "slides",
        objectKey: "events/event-1/participants/participant-1/slides/roster-ready-asset",
        fileName: "slides.pdf",
        contentType: "application/pdf",
        sizeBytes: 1_024,
        state: "ready",
        createdAt: now,
      },
      {
        id: "roster-pending-asset",
        tenantId: "org-1",
        eventId: "event-1",
        submissionId: "submission-1",
        participantId: "participant-1",
        kind: "supporting_file",
        objectKey: "events/event-1/participants/participant-1/supporting_file/roster-pending-asset",
        fileName: "notes.txt",
        contentType: "text/plain",
        sizeBytes: 128,
        state: "pending_upload",
        createdAt: now,
      },
    );

    const roster = await service.listOrganizerSpeakerRoster("org-1", "event-1", "account-1");
    const speaker = roster.speakers.find(
      (candidate) => candidate.participantId === "participant-1",
    );

    expect(speaker?.assets).toEqual([
      expect.objectContaining({
        assetId: "roster-ready-asset",
        status: "ready",
        downloadUrl: null,
      }),
      expect.objectContaining({
        assetId: "roster-pending-asset",
        status: "pending",
        downloadUrl: null,
      }),
    ]);
    expect(gateway.downloads).toHaveLength(0);
  });
  it("fails closed when verified email resolves to multiple accepted participants", async () => {
    const { repository, service } = createOrganizerFixture();
    repository.verifiedEmails.set("participant-2", "priya@example.test");
    await expect(
      service.createOrganizerSpeaker({
        organizationId: "org-1",
        eventId: "event-1",
        accountId: "account-1",
        displayName: "Priya Raman",
        email: "priya@example.test",
        jobTitle: "Principal Engineer",
        company: "Latticework Systems",
        biography: "Builds reliable developer platforms.",
        socialLinks: {},
        status: "pending",
        idempotencyKey: "duplicate-priya",
      }),
    ).rejects.toSatisfy((error: unknown) => {
      expectServiceError(error, "VALIDATION_ERROR");
      return true;
    });
  });
});

function expectServiceError(error: unknown, code: string): void {
  expect(error).toBeInstanceOf(SpeakerServiceError);
  expect((error as SpeakerServiceError).code).toBe(code);
}

describe("SpeakerService portal access", () => {
  it("hydrates the portal with one scope and one parallel read per projection", async () => {
    const repository = new CountingPortalRepository();
    repository.scopes.set("event-1:account-1", {
      tenantId: "org-1",
      submissionIds: ["submission-1", "speaker-submission:submission-1"],
      participantIds: ["participant-1"],
      primaryParticipantId: "participant-1",
      capabilities: [
        "profile-self",
        "roster-manage",
        "task-response",
        "asset-read",
        "resource-read",
      ],
    });
    repository.submissions.push(
      { ...submission("submission-1", "participant-1"), title: "Legacy title" },
      {
        ...submission("speaker-submission:submission-1", "participant-1"),
        title: "Canonical title",
      },
    );
    repository.profiles.push(profile("participant-1"));
    repository.tasks.push(task({ id: "portal-task", participantId: "participant-1" }));
    repository.assets.push({
      id: "portal-asset",
      tenantId: "org-1",
      eventId: "event-1",
      submissionId: "speaker-submission:submission-1",
      participantId: "participant-1",
      kind: "slides",
      objectKey: "events/event-1/participants/participant-1/slides/portal-asset",
      fileName: "slides.pdf",
      contentType: "application/pdf",
      sizeBytes: 1_024,
      state: "ready",
      createdAt: now,
    });
    repository.portalContexts.push({
      id: "portal:org-1:event-1",
      eventId: "event-1",
      name: "Portal event",
      capabilities: [
        "profile-self",
        "roster-manage",
        "task-response",
        "asset-read",
        "resource-read",
      ],
      submissionIds: ["submission-1"],
      participantIds: ["participant-1"],
      primaryParticipantId: "participant-1",
    });
    repository.roster.push({
      id: "roster:event-1:speaker-submission:submission-1:participant-1",
      eventId: "event-1",
      submissionId: "speaker-submission:submission-1",
      participantId: "participant-1",
      displayName: "Speaker participant-1",
      role: "primary",
      status: "active",
      version: 1,
      createdAt: now,
      updatedAt: now,
    });
    repository.resources.push({
      id: "resource-1",
      eventId: "event-1",
      title: "Resource",
      order: 1,
      updatedAt: now,
    });
    repository.wiki.push({
      id: "wiki-1",
      eventId: "event-1",
      title: "Wiki",
      order: 1,
      updatedAt: now,
      slug: "wiki",
    });
    const gateway = new FakePrivateAssetGateway();
    const service = new SpeakerService(repository, gateway, {
      now: () => new Date(now),
    });

    const portal = await service.getPortal("event-1", "account-1");

    expect({
      accessScope: repository.accessScopeReads,
      submissions: repository.submissionReads,
      profiles: repository.profileReads,
      tasks: repository.taskReads,
      contexts: repository.contextReads,
      assets: repository.assetReads,
      roster: repository.rosterReads,
      resources: repository.resourceReads,
      wiki: repository.wikiReads,
    }).toEqual({
      accessScope: 1,
      submissions: 1,
      profiles: 1,
      tasks: 1,
      contexts: 1,
      assets: 1,
      roster: 1,
      resources: 1,
      wiki: 1,
    });
    expect(portal.submissions).toEqual([
      expect.objectContaining({ id: "speaker-submission:submission-1", title: "Canonical title" }),
    ]);
    expect(portal.tasks).toEqual([expect.objectContaining({ id: "portal-task" })]);
    expect(portal.assets).toEqual([expect.objectContaining({ id: "portal-asset" })]);
    expect(portal.roster?.members).toEqual([
      expect.objectContaining({ participantId: "participant-1", role: "primary" }),
    ]);
    expect(portal.resources).toEqual([expect.objectContaining({ id: "resource-1" })]);
    expect(portal.wiki).toEqual([expect.objectContaining({ id: "wiki-1" })]);
    expect(gateway.downloads).toHaveLength(0);
  });
  it("returns only event-scoped submissions, profiles, accepted tasks, and status counts", async () => {
    const { service } = createFixture();

    const portal = await service.getPortal("event-1", "account-1");

    expect(portal.submissions.map(({ id }) => id)).toEqual(["submission-1", "submission-declined"]);
    expect(portal.profiles.map(({ participantId }) => participantId)).toEqual(["participant-1"]);
    expect(portal.tasks.map(({ id }) => id)).toEqual(["dependency", "slides-task", "action-task"]);
    expect(portal.outstandingTaskCount).toBe(2);
    expect(JSON.stringify(portal)).not.toContain("organizer-task");
    expect(JSON.stringify(portal)).not.toContain("participant-2");
    expect(JSON.stringify(portal)).not.toContain("participant-other-event");
  });
  it("loads canonical accepted rosters for the owning speaker and versions roster mutations", async () => {
    const { repository, service } = createOrganizerFixture();
    repository.scopes.set("event-1:account-1", {
      submissionIds: ["submission-1"],
      participantIds: ["participant-1"],
      primaryParticipantId: "participant-1",
      capabilities: ["profile-self", "task-response", "roster-manage"],
    });
    repository.roster.push({
      id: "roster:event-1:speaker-submission:submission-1:participant-1",
      eventId: "event-1",
      submissionId: "speaker-submission:submission-1",
      participantId: "participant-1",
      displayName: "Priya Raman",
      email: "priya@example.test",
      role: "primary",
      status: "active",
      version: 1,
      createdAt: now,
      updatedAt: now,
    });

    const portal = await service.getPortal("event-1", "account-1");
    expect(portal.capabilities).toContain("roster-manage");
    expect(portal.roster?.members).toEqual([
      expect.objectContaining({ participantId: "participant-1", role: "primary" }),
    ]);
    const initial = await service.getRoster("event-1", "account-1", "submission-1");
    expect(initial.submissionId).toBe("submission-1");
    expect(initial.capabilities).toEqual({ manage: true, invite: true });
    expect(initial.members).toEqual([
      expect.objectContaining({
        participantId: "participant-1",
        role: "primary",
        capabilities: { edit: false, remove: false },
      }),
    ]);

    const added = await service.addRosterEntry({
      eventId: "event-1",
      accountId: "account-1",
      submissionId: "submission-1",
      participantId: "participant-co",
      email: "co@example.test",
      displayName: "Co Speaker",
      role: "co_speaker",
    });
    expect(added.members).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ participantId: "participant-co", role: "co_speaker" }),
      ]),
    );
    const stored = repository.roster.find((entry) => entry.participantId === "participant-co");
    expect(stored).toEqual(
      expect.objectContaining({
        submissionId: "speaker-submission:submission-1",
        version: 1,
      }),
    );

    const updated = await service.updateRosterEntry({
      eventId: "event-1",
      accountId: "account-1",
      submissionId: "submission-1",
      participantId: "participant-co",
      displayName: "Renamed Co Speaker",
      role: "co_speaker",
      expectedVersion: 1,
    });
    expect(updated.members).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          participantId: "participant-co",
          displayName: "Renamed Co Speaker",
          role: "co_speaker",
        }),
      ]),
    );
    expect(
      repository.roster.find((entry) => entry.participantId === "participant-co")?.version,
    ).toBe(2);

    await expect(
      service.updateRosterEntry({
        eventId: "event-1",
        accountId: "account-1",
        submissionId: "submission-1",
        participantId: "participant-co",
        displayName: "Stale",
        expectedVersion: 1,
      }),
    ).rejects.toSatisfy((error: unknown) => {
      expectServiceError(error, "VERSION_CONFLICT");
      return true;
    });

    const removed = await service.removeRosterEntry({
      eventId: "event-1",
      accountId: "account-1",
      submissionId: "submission-1",
      participantId: "participant-co",
      expectedVersion: 2,
    });
    expect(removed.members).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ participantId: "participant-co", status: "revoked" }),
      ]),
    );

    await expect(service.getRoster("event-1", "account-2", "submission-1")).rejects.toSatisfy(
      (error: unknown) => {
        expectServiceError(error, "NOT_FOUND");
        return true;
      },
    );
  });

  it("does not grant profile or task authority from another account or event", async () => {
    const { service } = createFixture();

    await expect(
      service.updateBiography({
        eventId: "event-1",
        accountId: "account-1",
        participantId: "participant-2",
        biography: "Stolen biography",
        expectedVersion: 3,
      }),
    ).rejects.toSatisfy((error: unknown) => {
      expectServiceError(error, "NOT_FOUND");
      return true;
    });
    await expect(
      service.transitionTask({
        eventId: "event-1",
        accountId: "account-1",
        taskId: "other-speaker-task",
        toStatus: "in_progress",
        expectedVersion: 0,
      }),
    ).rejects.toSatisfy((error: unknown) => {
      expectServiceError(error, "NOT_FOUND");
      return true;
    });
    await expect(
      service.transitionTask({
        eventId: "event-2",
        accountId: "account-2",
        taskId: "other-event-task",
        toStatus: "in_progress",
        expectedVersion: 0,
      }),
    ).rejects.toSatisfy((error: unknown) => {
      expectServiceError(error, "NOT_FOUND");
      return true;
    });
  });
  it("keeps dual-role portal reads at speaker-grant scope while organizer reads stay explicit", async () => {
    const { service } = createDualRoleFixture();

    expect((await service.listSubmissions("event-1", "account-1")).map(({ id }) => id)).toEqual([
      "submission-1",
    ]);
    expect(
      (await service.listProfiles("event-1", "account-1")).map(
        ({ participantId }) => participantId,
      ),
    ).toEqual(["participant-1"]);
    expect((await service.listTasks("event-1", "account-1")).map(({ id }) => id)).toEqual([
      "dual-role-task-1",
    ]);
    expect((await service.listAssets("event-1", "account-1")).map(({ id }) => id)).toEqual([
      "dual-role-asset-1",
    ]);
    expect(
      (await service.listAssetComments("event-1", "account-1", "dual-role-asset-1")).map(
        ({ id }) => id,
      ),
    ).toEqual(["dual-role-comment-1"]);

    await expect(
      service.listAssetComments("event-1", "account-1", "dual-role-asset-2"),
    ).rejects.toSatisfy((error: unknown) => {
      expectServiceError(error, "NOT_FOUND");
      return true;
    });

    expect(
      (await service.listOrganizerProfiles("event-1", "account-1")).map(
        ({ participantId }) => participantId,
      ),
    ).toEqual(["participant-1", "participant-2"]);
    expect((await service.listOrganizerTasks("event-1", "account-1")).map(({ id }) => id)).toEqual([
      "dual-role-task-1",
      "dual-role-task-2",
    ]);
    expect((await service.listOrganizerAssets("event-1", "account-1")).map(({ id }) => id)).toEqual(
      ["dual-role-asset-1", "dual-role-asset-2"],
    );
    expect(
      (await service.listOrganizerAssetComments("event-1", "account-1", "dual-role-asset-2")).map(
        ({ id }) => id,
      ),
    ).toEqual(["dual-role-comment-2"]);
  });
});

describe("SpeakerService capability and canonical task scope", () => {
  it("fails closed when capabilities are absent or malformed", async () => {
    const { repository, service } = createFixture();
    repository.scopes.set("event-1:account-1", {
      submissionIds: ["submission-1"],
      participantIds: ["participant-1"],
    });

    expect(await service.listTasks("event-1", "account-1")).toEqual([]);
    expect((await service.getPortalContext("event-1", "account-1")).capabilities).toEqual([]);
    await expect(
      service.transitionTask({
        eventId: "event-1",
        accountId: "account-1",
        taskId: "action-task",
        toStatus: "completed",
        expectedVersion: 0,
      }),
    ).rejects.toSatisfy((error: unknown) => {
      expectServiceError(error, "NOT_FOUND");
      return true;
    });

    repository.scopes.set("event-1:account-1", {
      submissionIds: ["submission-1"],
      participantIds: ["participant-1"],
      capabilities: "task-response" as unknown as NonNullable<SpeakerAccessScope["capabilities"]>,
    });
    expect(await service.listTasks("event-1", "account-1")).toEqual([]);
  });
  it("requires an explicit roster grant even for the accepted submission owner", async () => {
    const { repository, service } = createOrganizerFixture();
    repository.scopes.set("event-1:account-1", {
      submissionIds: ["submission-1"],
      participantIds: ["participant-1"],
      primaryParticipantId: "participant-1",
      capabilities: ["profile-self", "task-response"],
    });

    await expect(
      service.addRosterEntry({
        eventId: "event-1",
        accountId: "account-1",
        submissionId: "submission-1",
        participantId: "participant-co",
        email: "co@example.test",
        displayName: "Co Speaker",
        role: "co_speaker",
      }),
    ).rejects.toSatisfy((error: unknown) => {
      expectServiceError(error, "NOT_FOUND");
      return true;
    });
  });

  it("allows explicit task grants while enforcing canonical submission scope for reused participants", async () => {
    const { repository, service } = createFixture();
    repository.scopes.set("event-1:account-1", {
      submissionIds: ["submission-1"],
      participantIds: ["participant-1"],
      capabilities: ["task-response"],
      capabilitiesByParticipant: {
        "participant-1": ["task-response"],
      },
    });
    repository.tasks.push(
      task({
        id: "reused-participant-cross-submission-task",
        participantId: "participant-1",
        submissionId: "submission-2",
      }),
    );

    expect((await service.listTasks("event-1", "account-1")).map(({ id }) => id)).toEqual([
      "dependency",
      "slides-task",
      "action-task",
    ]);
    const transitioned = await service.transitionTask({
      eventId: "event-1",
      accountId: "account-1",
      taskId: "action-task",
      toStatus: "completed",
      expectedVersion: 0,
    });
    expect(transitioned.task.status).toBe("completed");
    await expect(
      service.transitionTask({
        eventId: "event-1",
        accountId: "account-1",
        taskId: "reused-participant-cross-submission-task",
        toStatus: "in_progress",
        expectedVersion: 0,
      }),
    ).rejects.toSatisfy((error: unknown) => {
      expectServiceError(error, "NOT_FOUND");
      return true;
    });
    const crossSubmissionTask = repository.tasks.find(
      ({ id }) => id === "reused-participant-cross-submission-task",
    );
    expect(crossSubmissionTask?.status).toBe("not_started");
  });
});

describe("SpeakerService profile updates", () => {
  it("normalizes an authorized biography and uses optimistic concurrency", async () => {
    const { service } = createFixture();

    const updated = await service.updateBiography({
      eventId: "event-1",
      accountId: "account-1",
      participantId: "participant-1",
      biography: "  A speaker biography.\r\nSecond line.  ",
      expectedVersion: 3,
    });

    expect(updated.biography).toBe("A speaker biography.\nSecond line.");
    expect(updated.version).toBe(4);
    expect(updated.updatedAt).toBe(now);
    await expect(
      service.updateBiography({
        eventId: "event-1",
        accountId: "account-1",
        participantId: "participant-1",
        biography: "Stale write",
        expectedVersion: 3,
      }),
    ).rejects.toSatisfy((error: unknown) => {
      expectServiceError(error, "VERSION_CONFLICT");
      return true;
    });
  });

  it("rejects control characters instead of persisting unsafe biography content", async () => {
    const { service } = createFixture();

    await expect(
      service.updateBiography({
        eventId: "event-1",
        accountId: "account-1",
        participantId: "participant-1",
        biography: "Biography\u0000payload",
        expectedVersion: 3,
      }),
    ).rejects.toSatisfy((error: unknown) => {
      expectServiceError(error, "VALIDATION_ERROR");
      return true;
    });
  });
});

describe("SpeakerService task workflow", () => {
  it("enforces dependencies and records the speaker transition atomically", async () => {
    const { repository, service } = createFixture();
    const dependency = repository.tasks.find(({ id }) => id === "dependency");
    if (!dependency) {
      throw new Error("Missing dependency fixture");
    }
    dependency.status = "in_progress";

    await expect(
      service.transitionTask({
        eventId: "event-1",
        accountId: "account-1",
        taskId: "slides-task",
        toStatus: "in_progress",
        expectedVersion: 0,
      }),
    ).rejects.toSatisfy((error: unknown) => {
      expectServiceError(error, "TASK_DEPENDENCY_INCOMPLETE");
      return true;
    });

    dependency.status = "completed";
    const result = await service.transitionTask({
      eventId: "event-1",
      accountId: "account-1",
      taskId: "slides-task",
      toStatus: "in_progress",
      expectedVersion: 0,
      note: "  Preparing final slides.  ",
    });

    expect(result.task).toMatchObject({ status: "in_progress", version: 1 });
    expect(result.transitionId).toBe("generated-1");
    expect(repository.transitions).toEqual([
      expect.objectContaining({
        actorAccountId: "account-1",
        participantId: "participant-1",
        fromStatus: "not_started",
        toStatus: "in_progress",
        note: "Preparing final slides.",
        occurredAt: now,
      }),
    ]);
  });

  it("allows action completion but prevents speakers from forcing organizer-owned states", async () => {
    const { repository, service } = createFixture();

    const completed = await service.transitionTask({
      eventId: "event-1",
      accountId: "account-1",
      taskId: "action-task",
      toStatus: "completed",
      expectedVersion: 0,
    });
    expect(completed.task.status).toBe("completed");

    await expect(
      service.transitionTask({
        eventId: "event-1",
        accountId: "account-1",
        taskId: "slides-task",
        toStatus: "waived",
        expectedVersion: 0,
      }),
    ).rejects.toSatisfy((error: unknown) => {
      expectServiceError(error, "INVALID_TASK_TRANSITION");
      return true;
    });
    await expect(
      service.transitionTask({
        eventId: "event-1",
        accountId: "account-1",
        taskId: "organizer-task",
        toStatus: "completed",
        expectedVersion: 0,
      }),
    ).rejects.toSatisfy((error: unknown) => {
      expectServiceError(error, "NOT_FOUND");
      return true;
    });
    expect(repository.transitions).toHaveLength(1);
  });

  it("keeps tasks inactive until their submission is accepted", async () => {
    const { service } = createFixture();

    await expect(
      service.transitionTask({
        eventId: "event-1",
        accountId: "account-1",
        taskId: "declined-task",
        toStatus: "in_progress",
        expectedVersion: 0,
      }),
    ).rejects.toSatisfy((error: unknown) => {
      expectServiceError(error, "TASK_NOT_ACTIVE");
      return true;
    });
  });
});

describe("SpeakerService private asset authorization", () => {
  it("issues short-lived private, scanned upload access without using the file name as a key", async () => {
    const { gateway, repository, service } = createFixture();

    const result = await service.issueUploadGrant({
      eventId: "event-1",
      accountId: "account-1",
      participantId: "participant-1",
      kind: "headshot",
      fileName: "../speaker.jpg",
      contentType: "image/jpeg",
      sizeBytes: 512_000,
    });

    expect(result.asset).toMatchObject({
      id: "generated-1",
      eventId: "event-1",
      participantId: "participant-1",
      fileName: "..-speaker.jpg",
      state: "pending_upload",
    });
    expect(result.asset.objectKey).toBe(
      "events/event-1/participants/participant-1/headshot/generated-1",
    );
    expect(repository.assets).toHaveLength(1);
    expect(gateway.uploads).toEqual([
      {
        objectKey: result.asset.objectKey,
        contentType: "image/jpeg",
        sizeBytes: 512_000,
        expiresAt: "2026-08-08T12:05:00.000Z",
        private: true,
        requireMalwareScan: true,
        stripMetadata: true,
      },
    ]);
  });

  it("binds task uploads to the authorized task and its configured asset kinds", async () => {
    const { gateway, service } = createFixture();

    const result = await service.issueUploadGrant({
      eventId: "event-1",
      accountId: "account-1",
      participantId: "participant-1",
      taskId: "slides-task",
      kind: "slides",
      fileName: "conference-slides.pdf",
      contentType: "application/pdf",
      sizeBytes: 2_000_000,
    });

    expect(result.asset).toMatchObject({
      taskId: "slides-task",
      kind: "slides",
      state: "pending_upload",
    });
    expect(gateway.uploads[0]).toMatchObject({
      private: true,
      requireMalwareScan: true,
      stripMetadata: false,
    });
  });

  it("enforces participant, task, media-type, and size policies before issuing access", async () => {
    const { gateway, service } = createFixture();

    const attempts = [
      service.issueUploadGrant({
        eventId: "event-1",
        accountId: "account-1",
        participantId: "participant-2",
        kind: "headshot",
        fileName: "speaker.jpg",
        contentType: "image/jpeg",
        sizeBytes: 100,
      }),
      service.issueUploadGrant({
        eventId: "event-1",
        accountId: "account-1",
        participantId: "participant-1",
        kind: "headshot",
        fileName: "speaker.svg",
        contentType: "image/svg+xml",
        sizeBytes: 100,
      }),
      service.issueUploadGrant({
        eventId: "event-1",
        accountId: "account-1",
        participantId: "participant-1",
        taskId: "slides-task",
        kind: "headshot",
        fileName: "speaker.jpg",
        contentType: "image/jpeg",
        sizeBytes: 100,
      }),
    ];

    const results = await Promise.allSettled(attempts);
    expect(results.every((result) => result.status === "rejected")).toBe(true);
    expect(gateway.uploads).toHaveLength(0);
  });

  it("allows downloads only for ready assets owned in the current event", async () => {
    const { gateway, repository, service } = createFixture();
    repository.assets.push({
      id: "asset-1",
      eventId: "event-1",
      participantId: "participant-1",
      kind: "slides",
      objectKey: "events/event-1/participants/participant-1/slides/asset-1",
      fileName: "slides.pdf",
      contentType: "application/pdf",
      sizeBytes: 1_024,
      state: "ready",
      createdAt: now,
    });

    const grant = await service.issueDownloadGrant({
      eventId: "event-1",
      accountId: "account-1",
      assetId: "asset-1",
    });
    expect(grant.expiresAt).toBe("2026-08-08T12:02:00.000Z");
    expect(gateway.downloads).toHaveLength(1);

    await expect(
      service.issueDownloadGrant({
        eventId: "event-1",
        accountId: "account-2",
        assetId: "asset-1",
      }),
    ).rejects.toSatisfy((error: unknown) => {
      expectServiceError(error, "NOT_FOUND");
      return true;
    });
    expect(gateway.downloads).toHaveLength(1);
  });
});

describe("speaker routes", () => {
  it("uses an injected authentication boundary and safe event-scoped errors", async () => {
    const { service } = createFixture();
    const app = createSpeakerRoutes({
      service,
      authenticate: async (request) =>
        request.headers.get("authorization") === "Bearer account-1"
          ? { accountId: "account-1" }
          : null,
    });
    const requestId = "65f8d9b5-6862-4bbc-973c-f728e9185c22";

    const unauthenticated = await app.request("/events/event-1/portal");
    expect(unauthenticated.status).toBe(401);
    expect(await unauthenticated.json()).toMatchObject({
      error: { code: "AUTHENTICATION_REQUIRED" },
    });

    const portal = await app.request("/events/event-1/portal", {
      headers: { authorization: "Bearer account-1", "x-request-id": requestId },
    });
    expect(portal.status).toBe(200);
    expect(portal.headers.get("cache-control")).toBe("private, no-store");
    expect(portal.headers.get("x-request-id")).toBe(requestId);
    expect(await portal.json()).toMatchObject({ data: { outstandingTaskCount: 2 } });

    const crossUser = await app.request("/events/event-1/profiles/participant-2", {
      method: "PATCH",
      headers: {
        authorization: "Bearer account-1",
        "content-type": "application/json",
      },
      body: JSON.stringify({ biography: "Unauthorized", expectedVersion: 3 }),
    });
    const error = await crossUser.json();
    expect(crossUser.status).toBe(404);
    expect(error).toMatchObject({ error: { code: "NOT_FOUND" } });
    expect(JSON.stringify(error)).not.toContain("participant-2");
  });
  it("keeps private object keys out of the organizer asset envelope", async () => {
    const { repository, service } = createOrganizerFixture();
    repository.assets.push({
      id: "route-private-asset",
      tenantId: "org-1",
      eventId: "event-1",
      submissionId: "submission-1",
      participantId: "participant-1",
      kind: "slides",
      objectKey: "private/r2/secret-route-private-asset",
      fileName: "slides.pdf",
      contentType: "application/pdf",
      sizeBytes: 1_024,
      state: "ready",
      createdAt: now,
    });
    const app = createSpeakerRoutes({
      service,
      authenticate: async (request) =>
        request.headers.get("authorization") === "Bearer account-1"
          ? { accountId: "account-1" }
          : null,
    });

    const response = await app.request("/events/event-1/organizer/assets", {
      headers: { authorization: "Bearer account-1" },
    });
    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      data: Array<Record<string, unknown>>;
    };
    expect(payload.data).toEqual([
      expect.objectContaining({
        id: "route-private-asset",
        eventId: "event-1",
        participantId: "participant-1",
      }),
    ]);
    expect(payload.data[0]).not.toHaveProperty("objectKey");
    expect(payload.data[0]).not.toHaveProperty("tenantId");
    expect(JSON.stringify(payload)).not.toContain("secret-route-private-asset");
  });
});
it("persists logistics, exposes reminder eligibility, and queues a versioned bulk email", async () => {
  const { repository } = createOrganizerFixture();
  const deliveries: Array<{ participantId: string; subject: string; html: string }> = [];
  const service = new SpeakerService(repository, new FakePrivateAssetGateway(), {
    now: () => new Date(now),
    generateId: (() => {
      let sequence = 0;
      return () => `email-generated-${++sequence}`;
    })(),
    emailDelivery: {
      enqueueEmail(input) {
        deliveries.push({
          participantId: input.participantId,
          subject: input.subject,
          html: input.html,
        });
        return Promise.resolve({ status: "queued" as const });
      },
    },
  });

  await service.createOrganizerSpeaker({
    organizationId: "org-1",
    eventId: "event-1",
    accountId: "account-1",
    displayName: "Priya Raman",
    email: "priya@example.test",
    jobTitle: "Principal Engineer",
    company: "Latticework Systems",
    biography: "Builds reliable developer platforms.",
    socialLinks: {},
    status: "confirmed",
    travelLogistics: {
      travelRequired: true,
      arrivalAt: "2026-08-07",
      departureAt: "2026-08-10",
      accommodation: "Hotel near venue",
      dietaryRequirements: "Vegetarian",
      accessibilityNeeds: "Quiet room",
      travelNotes: "Arrange airport transfer",
    },
    idempotencyKey: "speaker-priya",
  });
  const roster = await service.createOrganizerSpeaker({
    organizationId: "org-1",
    eventId: "event-1",
    accountId: "account-1",
    displayName: "Marcus Okafor",
    email: "marcus@example.test",
    jobTitle: "Community Lead",
    company: "Northstar",
    biography: "Builds community programs.",
    socialLinks: {},
    status: "confirmed",
    idempotencyKey: "speaker-marcus",
  });
  const priya = roster.speakers.find((speaker) => speaker.participantId === "participant-1");
  expect(
    (priya as (typeof priya & { travelLogistics?: Record<string, unknown> }) | undefined)
      ?.travelLogistics,
  ).toMatchObject({
    travelRequired: true,
    accommodation: "Hotel near venue",
    dietaryRequirements: "Vegetarian",
  });

  const task = await service.createOrganizerTask({
    eventId: "event-1",
    accountId: "account-1",
    type: "action",
    title: "Provide arrival details",
    description: "Share the confirmed arrival plan.",
    dueAt: "2026-08-07",
    reminderOffsetsMinutes: [60],
    assigneeIds: ["participant-1", "participant-2"],
  });
  expect(task).toHaveLength(2);
  expect(new Set(task.map((item) => item.participantId))).toEqual(
    new Set(["participant-1", "participant-2"]),
  );
  expect(task.every((item) => item.dueAt === "2026-08-07")).toBe(true);

  const eligibility = await service.getReminderEligibility({
    eventId: "event-1",
    accountId: "account-1",
  });
  expect(eligibility.eligibleTaskIds).toEqual(expect.arrayContaining(task.map((item) => item.id)));

  const template = await service.createOrganizerSpeakerEmailTemplate({
    organizationId: "org-1",
    eventId: "event-1",
    accountId: "account-1",
    name: "Speaker update",
    subject: "Hello {{first_name}}",
    html: "<p>Hello {{first_name}}</p>",
    text: "Hello {{first_name}}",
  });
  const preview = await service.previewOrganizerSpeakerEmails({
    organizationId: "org-1",
    eventId: "event-1",
    accountId: "account-1",
    participantIds: ["participant-1", "participant-2"],
    templateId: template.id,
    templateVersion: template.version,
  });
  expect(preview.recipients.map((recipient) => recipient.firstName)).toEqual(["Priya", "Marcus"]);
  expect(preview.recipients[0]?.html).toContain("Hello Priya");
  const send = await service.sendOrganizerSpeakerEmails({
    organizationId: "org-1",
    eventId: "event-1",
    accountId: "account-1",
    previewId: preview.id,
    idempotencyKey: "bulk-email-once",
  });
  expect(send.status).toBe("queued");
  expect(deliveries).toHaveLength(2);
  expect(send.history.some((entry) => entry.action === "delivery_queued")).toBe(true);
});
it("queues due scheduled reminders idempotently without sending ineligible tasks", async () => {
  const { repository } = createOrganizerFixture();
  repository.tasks.push(
    task({
      id: "scheduled-due",
      participantId: "participant-1",
      dueAt: "2026-08-07T12:00:00.000Z",
      reminderOffsetsMinutes: [60],
    }),
    task({
      id: "scheduled-complete",
      participantId: "participant-1",
      status: "completed",
      dueAt: "2026-08-07T12:00:00.000Z",
      reminderOffsetsMinutes: [60],
    }),
    task({
      id: "scheduled-no-due",
      participantId: "participant-1",
      reminderOffsetsMinutes: [60],
    }),
    task({
      id: "scheduled-future",
      participantId: "participant-1",
      dueAt: "2026-09-01T12:00:00.000Z",
      reminderOffsetsMinutes: [60],
    }),
  );
  const deliveries: Array<{
    readonly actorAccountId: string;
    readonly idempotencyKey: string;
    readonly participantId: string;
    readonly taskIds: readonly string[];
  }> = [];
  const scheduledService = new SpeakerService(repository, new FakePrivateAssetGateway(), {
    now: () => new Date(now),
    delivery: {
      enqueue(input) {
        deliveries.push({
          actorAccountId: input.actorAccountId,
          idempotencyKey: input.idempotencyKey,
          participantId: input.recipient.participantId,
          taskIds: input.recipient.taskIds,
        });
        return Promise.resolve({ queued: true, duplicate: false });
      },
    },
  });

  const first = await scheduledService.queueScheduledReminders({
    organizationId: "org-1",
    eventId: "event-1",
    organizerAccountIds: ["account-1"],
  });
  const second = await scheduledService.queueScheduledReminders({
    organizationId: "org-1",
    eventId: "event-1",
    organizerAccountIds: ["account-1"],
  });

  expect(first).toMatchObject({
    queued: true,
    duplicate: false,
    sentCount: 1,
    recipientIds: ["participant-1"],
  });
  expect(second).toMatchObject({
    queued: false,
    duplicate: true,
    sentCount: 1,
    idempotencyKey: first.idempotencyKey,
  });
  expect(deliveries).toEqual([
    {
      actorAccountId: "system:speaker-reminder-scheduler",
      idempotencyKey: first.idempotencyKey,
      participantId: "participant-1",
      taskIds: ["scheduled-due"],
    },
  ]);
});
