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
  SpeakerProfile,
  SpeakerRepository,
  SpeakerSubmission,
  SpeakerTask,
  SpeakerTaskTransition,
  TransitionSpeakerTaskCommand,
  UpdateBiographyCommand,
} from "./types";

class FakeSpeakerRepository implements SpeakerRepository {
  readonly scopes = new Map<string, SpeakerAccessScope>();
  readonly submissions: SpeakerSubmission[] = [];
  readonly profiles: SpeakerProfile[] = [];
  readonly tasks: SpeakerTask[] = [];
  readonly assets: SpeakerAsset[] = [];
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
  });
  repository.scopes.set("event-1:account-2", {
    submissionIds: ["submission-2"],
    participantIds: ["participant-2"],
  });
  repository.scopes.set("event-2:account-1", {
    submissionIds: ["submission-other-event"],
    participantIds: ["participant-other-event"],
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

function expectServiceError(error: unknown, code: string): void {
  expect(error).toBeInstanceOf(SpeakerServiceError);
  expect((error as SpeakerServiceError).code).toBe(code);
}

describe("SpeakerService portal access", () => {
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
});
